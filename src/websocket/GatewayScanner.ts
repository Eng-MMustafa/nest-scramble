/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import { TsProject } from '../analysis/TsProject';
import {
  getDecoratorArguments,
  getDecoratorName,
  getDecorators,
  getJsDocInfo,
  numericLiteralValue,
} from '../analysis/AstHelpers';
import { AnalyzedType, DtoAnalyzer } from '../utils/DtoAnalyzer';
import { resolveSourcePath } from '../scanner/ScannerService';
import { ScrambleLogger } from '../utils/ScrambleLogger';

/** One `@SubscribeMessage()` handler. */
export interface GatewayEventInfo {
  /** Event name from `@SubscribeMessage('event')`. */
  event: string;
  methodName: string;
  /** Type of the `@MessageBody()` parameter, when present. */
  payloadType?: AnalyzedType;
  /** Return type — either a `WsResponse` or the acknowledgement payload. */
  returnType?: AnalyzedType;
  summary?: string;
  description?: string;
}

/** One `@WebSocketGateway()` class. */
export interface GatewayInfo {
  name: string;
  /** From `@WebSocketGateway({ namespace })`, empty for the default namespace. */
  namespace: string;
  /** From `@WebSocketGateway(port)`, when a dedicated port is used. */
  port?: number;
  events: GatewayEventInfo[];
}

/**
 * Scans a NestJS source tree for WebSocket gateways using the same static
 * analysis approach as the HTTP scanner: no runtime, no decorator metadata,
 * just the TypeScript AST and type checker.
 */
export class GatewayScanner {
  scanGateways(sourcePath: string): GatewayInfo[] {
    const hostProjectRoot = process.cwd();
    const fullSourcePath = resolveSourcePath(sourcePath, hostProjectRoot);
    const tsconfigPath = path.join(hostProjectRoot, 'tsconfig.json');

    let project: TsProject;
    try {
      project = fs.existsSync(tsconfigPath) ? new TsProject(tsconfigPath) : new TsProject();
      project.addSourceFilesInDirectory(fullSourcePath);
    } catch (error) {
      ScrambleLogger.warn(`Gateway scan failed to load sources: ${error}`);
      return [];
    }

    const analyzer = new DtoAnalyzer(project.getChecker());
    const gateways: GatewayInfo[] = [];

    const gatewayClasses = project
      .getSourceFiles()
      .flatMap(file => file.statements.filter(ts.isClassDeclaration))
      .filter(cls =>
        getDecorators(cls).some(decorator => getDecoratorName(decorator) === 'WebSocketGateway'),
      );

    for (const cls of gatewayClasses) {
      const gateway = this.extractGatewayInfo(cls, analyzer);
      if (gateway) {
        gateways.push(gateway);
        ScrambleLogger.debug(`  - ${gateway.name} (${gateway.events.length} event(s))`);
      }
    }

    return gateways;
  }

  private extractGatewayInfo(cls: ts.ClassDeclaration, analyzer: DtoAnalyzer): GatewayInfo | null {
    const decorator = getDecorators(cls).find(
      d => getDecoratorName(d) === 'WebSocketGateway',
    );
    if (!decorator) return null;

    const { namespace, port } = this.extractGatewayOptions(decorator);

    const events: GatewayEventInfo[] = [];
    for (const member of cls.members) {
      if (!ts.isMethodDeclaration(member)) continue;
      const event = this.extractEventInfo(member, analyzer);
      if (event) events.push(event);
    }

    return {
      name: cls.name?.text || 'UnknownGateway',
      namespace,
      port,
      events,
    };
  }

  /**
   * Reads `@WebSocketGateway()`, `@WebSocketGateway(3001)` and
   * `@WebSocketGateway({ namespace: '/chat', ... })`.
   */
  private extractGatewayOptions(decorator: ts.Decorator): { namespace: string; port?: number } {
    const args = getDecoratorArguments(decorator);
    let namespace = '';
    let port: number | undefined;

    for (const arg of args) {
      const numeric = numericLiteralValue(arg);
      if (numeric !== undefined) {
        port = numeric;
        continue;
      }
      if (ts.isObjectLiteralExpression(arg)) {
        for (const prop of arg.properties) {
          if (!ts.isPropertyAssignment(prop)) continue;
          if (prop.name.getText() === 'namespace' && ts.isStringLiteral(prop.initializer)) {
            namespace = prop.initializer.text;
          }
        }
      }
    }

    // Normalise to a leading slash, the way socket.io addresses namespaces.
    if (namespace && !namespace.startsWith('/')) namespace = '/' + namespace;

    return { namespace, port };
  }

  private extractEventInfo(
    method: ts.MethodDeclaration,
    analyzer: DtoAnalyzer,
  ): GatewayEventInfo | null {
    const subscribe = getDecorators(method).find(
      d => getDecoratorName(d) === 'SubscribeMessage',
    );
    if (!subscribe) return null;

    const args = getDecoratorArguments(subscribe);
    const first = args[0];
    if (!first || !ts.isStringLiteral(first)) return null;

    // The payload is the `@MessageBody()` parameter. Without the decorator the
    // first non-socket parameter is the best available guess.
    let payloadParam = method.parameters.find(param =>
      getDecorators(param).some(d => getDecoratorName(d) === 'MessageBody'),
    );
    if (!payloadParam) {
      payloadParam = method.parameters.find(
        param => !getDecorators(param).some(d => getDecoratorName(d) === 'ConnectedSocket'),
      );
    }

    const { description: text, deprecated: _deprecated } = getJsDocInfo(method);
    const [firstLine, ...rest] = (text || '').split('\n');

    return {
      event: first.text,
      methodName: method.name.getText(),
      payloadType: payloadParam ? analyzer.analyzeType(analyzer.typeOf(payloadParam)) : undefined,
      returnType: analyzer.analyzeType(analyzer.returnTypeOf(method)),
      summary: firstLine.trim() || undefined,
      description: rest.join('\n').trim() || undefined,
    };
  }
}

/** JSON-schema-ish rendering of an analyzed type, for the WS docs endpoint. */
export function analyzedTypeToWsSchema(type: AnalyzedType | undefined, depth = 0): any {
  if (!type || depth > 6) return {};

  if (type.isArray) {
    return { type: 'array', items: analyzedTypeToWsSchema({ ...type, isArray: false }, depth + 1) };
  }
  if (type.enumValues && type.enumValues.length) {
    return { type: 'string', enum: type.enumValues };
  }
  if (type.properties && type.properties.length) {
    const properties: Record<string, any> = {};
    const required: string[] = [];
    for (const prop of type.properties) {
      properties[prop.name] = analyzedTypeToWsSchema(prop.type, depth + 1);
      if (prop.description) properties[prop.name].description = prop.description;
      if (!prop.type.isOptional) required.push(prop.name);
    }
    const schema: any = { type: 'object', title: type.type, properties };
    if (required.length) schema.required = required;
    return schema;
  }

  switch (type.type) {
    case 'string':
      return { type: 'string' };
    case 'number':
      return { type: 'number' };
    case 'boolean':
      return { type: 'boolean' };
    case 'void':
    case 'undefined':
    case 'any':
    case 'unknown':
      return {};
    default:
      return { type: 'object', title: type.type };
  }
}

/**
 * Builds the document served at `/docs-ws-json` — everything the docs UI
 * needs to list gateways and open a live console for each event.
 */
export function buildWsDocument(
  gateways: GatewayInfo[],
  info: { title: string; version: string },
): any {
  return {
    generator: 'nest-scramble',
    info,
    gateways: gateways.map(gateway => ({
      name: gateway.name,
      namespace: gateway.namespace,
      port: gateway.port,
      events: gateway.events.map(event => ({
        event: event.event,
        summary: event.summary,
        description: event.description,
        payload: analyzedTypeToWsSchema(event.payloadType),
        response: analyzedTypeToWsSchema(event.returnType),
      })),
    })),
  };
}
