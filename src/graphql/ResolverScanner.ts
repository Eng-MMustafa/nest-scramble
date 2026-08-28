/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import * as ts from 'typescript';
import * as path from 'path';
import * as fs from 'fs';
import { TsProject } from '../analysis/TsProject';
import {
  getDecoratorArguments,
  getDecoratorName,
  getDecorators,
  getJsDocInfo,
  objectPropertyInitializer,
} from '../analysis/AstHelpers';
import { AnalyzedType, DtoAnalyzer } from '../utils/DtoAnalyzer';
import { analyzedTypeToWsSchema } from '../websocket/GatewayScanner';
import { resolveSourcePath } from '../scanner/ScannerService';
import { ScrambleLogger } from '../utils/ScrambleLogger';

export type GraphQLOperationKind = 'query' | 'mutation' | 'subscription';

/** One argument of a resolver method, from `@Args('name')` or `@Args()`. */
export interface ResolverArgInfo {
  name: string;
  type: AnalyzedType;
  isOptional: boolean;
}

/** One `@Query()` / `@Mutation()` / `@Subscription()` handler. */
export interface ResolverOperationInfo {
  kind: GraphQLOperationKind;
  /** Schema field name — `{ name }` decorator option, or the method name. */
  name: string;
  methodName: string;
  args: ResolverArgInfo[];
  returnType?: AnalyzedType;
  summary?: string;
  description?: string;
  deprecated?: boolean;
}

/** One `@Resolver()` class. */
export interface ResolverInfo {
  name: string;
  /** From `@Resolver(() => User)` or `@Resolver('User')`, empty when untyped. */
  typeName: string;
  operations: ResolverOperationInfo[];
}

const OPERATION_DECORATORS: Record<string, GraphQLOperationKind> = {
  Query: 'query',
  Mutation: 'mutation',
  Subscription: 'subscription',
};

/**
 * Scans a NestJS source tree for `@nestjs/graphql` code-first resolvers using
 * the same static approach as the HTTP and WebSocket scanners: the TypeScript
 * AST and type checker, no application bootstrap, no schema build.
 */
export class ResolverScanner {
  scanResolvers(sourcePath: string): ResolverInfo[] {
    const hostProjectRoot = process.cwd();
    const fullSourcePath = resolveSourcePath(sourcePath, hostProjectRoot);
    const tsconfigPath = path.join(hostProjectRoot, 'tsconfig.json');

    let project: TsProject;
    try {
      project = fs.existsSync(tsconfigPath) ? new TsProject(tsconfigPath) : new TsProject();
      project.addSourceFilesInDirectory(fullSourcePath);
    } catch (error) {
      ScrambleLogger.warn(`Resolver scan failed to load sources: ${error}`);
      return [];
    }

    const analyzer = new DtoAnalyzer(project.getChecker());
    const resolvers: ResolverInfo[] = [];

    const resolverClasses = project
      .getSourceFiles()
      .flatMap(file => file.statements.filter(ts.isClassDeclaration))
      .filter(cls =>
        getDecorators(cls).some(decorator => getDecoratorName(decorator) === 'Resolver'),
      );

    for (const cls of resolverClasses) {
      const resolver = this.extractResolverInfo(cls, analyzer);
      if (resolver) {
        resolvers.push(resolver);
        ScrambleLogger.debug(`  - ${resolver.name} (${resolver.operations.length} operation(s))`);
      }
    }

    return resolvers;
  }

  private extractResolverInfo(cls: ts.ClassDeclaration, analyzer: DtoAnalyzer): ResolverInfo | null {
    const decorator = getDecorators(cls).find(d => getDecoratorName(d) === 'Resolver');
    if (!decorator) return null;

    const operations: ResolverOperationInfo[] = [];
    for (const member of cls.members) {
      if (!ts.isMethodDeclaration(member)) continue;
      const operation = this.extractOperationInfo(member, analyzer);
      if (operation) operations.push(operation);
    }

    return {
      name: cls.name?.text || 'UnknownResolver',
      typeName: this.extractResolverType(decorator),
      operations,
    };
  }

  /** Reads `@Resolver('User')` and `@Resolver(() => User)`. */
  private extractResolverType(decorator: ts.Decorator): string {
    const first = getDecoratorArguments(decorator)[0];
    if (!first) return '';
    if (ts.isStringLiteral(first)) return first.text;
    if (ts.isArrowFunction(first) && ts.isIdentifier(first.body)) return first.body.text;
    return '';
  }

  private extractOperationInfo(
    method: ts.MethodDeclaration,
    analyzer: DtoAnalyzer,
  ): ResolverOperationInfo | null {
    let kind: GraphQLOperationKind | undefined;
    let opDecorator: ts.Decorator | undefined;

    for (const decorator of getDecorators(method)) {
      const name = getDecoratorName(decorator);
      if (name && OPERATION_DECORATORS[name]) {
        kind = OPERATION_DECORATORS[name];
        opDecorator = decorator;
        break;
      }
    }
    if (!kind || !opDecorator) return null;

    const { description: text, deprecated } = getJsDocInfo(method);
    const [firstLine, ...rest] = (text || '').split('\n');

    return {
      kind,
      name: this.extractOperationName(opDecorator) || method.name.getText(),
      methodName: method.name.getText(),
      args: this.extractArgs(method, analyzer),
      returnType: analyzer.analyzeType(analyzer.returnTypeOf(method)),
      summary: firstLine.trim() || undefined,
      description: rest.join('\n').trim() || undefined,
      deprecated,
    };
  }

  /** The `{ name: 'x' }` option of `@Query(() => Type, { name: 'x' })`. */
  private extractOperationName(decorator: ts.Decorator): string | undefined {
    for (const arg of getDecoratorArguments(decorator)) {
      if (!ts.isObjectLiteralExpression(arg)) continue;
      const initializer = objectPropertyInitializer(arg, 'name');
      if (initializer && ts.isStringLiteral(initializer)) return initializer.text;
    }
    return undefined;
  }

  private extractArgs(method: ts.MethodDeclaration, analyzer: DtoAnalyzer): ResolverArgInfo[] {
    const args: ResolverArgInfo[] = [];

    for (const param of method.parameters) {
      const argsDecorator = getDecorators(param).find(
        d => getDecoratorName(d) === 'Args',
      );
      if (!argsDecorator) continue;

      const decoratorArgs = getDecoratorArguments(argsDecorator);
      const nameArg = decoratorArgs.find(ts.isStringLiteral);
      const optionsArg = decoratorArgs.find(ts.isObjectLiteralExpression);

      let isOptional = !!param.questionToken;
      if (optionsArg) {
        const nullable = objectPropertyInitializer(optionsArg, 'nullable');
        if (nullable && nullable.kind === ts.SyntaxKind.TrueKeyword) isOptional = true;
      }

      args.push({
        // `@Args('id')` names one argument; a bare `@Args()` binds a whole
        // args DTO, in which case the parameter name is the best label.
        name: nameArg ? nameArg.text : param.name.getText(),
        type: analyzer.analyzeType(analyzer.typeOf(param)),
        isOptional,
      });
    }

    return args;
  }
}

/** A deterministic GraphQL literal for one analyzed argument type. */
function graphqlExampleLiteral(type: AnalyzedType, depth = 0): string {
  if (depth > 3) return 'null';
  if (type.isArray) return `[${graphqlExampleLiteral({ ...type, isArray: false }, depth + 1)}]`;
  if (type.enumValues && type.enumValues.length) return type.enumValues[0];
  if (type.properties && type.properties.length) {
    const fields = type.properties
      .filter(prop => !prop.type.isOptional)
      .map(prop => `${prop.name}: ${graphqlExampleLiteral(prop.type, depth + 1)}`);
    return `{ ${fields.join(', ')} }`;
  }
  switch (type.type) {
    case 'string':
      return '"example"';
    case 'number':
      return '1';
    case 'boolean':
      return 'true';
    default:
      return type.type === 'Date' ? '"2026-01-01T00:00:00.000Z"' : '"example"';
  }
}

/** The selection set for a return type, two levels deep. */
function graphqlSelectionSet(type: AnalyzedType | undefined, depth = 0): string {
  if (!type || depth > 2) return '';
  const base = type.isArray ? { ...type, isArray: false } : type;
  if (!base.properties || base.properties.length === 0) return '';

  const indent = '  '.repeat(depth + 1);
  const fields = base.properties.map(prop => {
    const nested = graphqlSelectionSet(prop.type, depth + 1);
    return `${indent}${prop.name}${nested}`;
  });
  return ` {\n${fields.join('\n')}\n${'  '.repeat(depth)}}`;
}

/** A ready-to-run operation string for the docs console. */
export function buildSampleOperation(operation: ResolverOperationInfo): string {
  const keyword = operation.kind === 'subscription' ? 'subscription' : operation.kind;
  const args = operation.args
    .filter(arg => !arg.isOptional)
    .map(arg => `${arg.name}: ${graphqlExampleLiteral(arg.type)}`)
    .join(', ');

  const call = args ? `${operation.name}(${args})` : operation.name;
  const selection = graphqlSelectionSet(operation.returnType, 1);
  return `${keyword} {\n  ${call}${selection || ''}\n}`;
}

/**
 * Builds the document served at `/docs-graphql-json` — everything the docs UI
 * needs to list resolvers and prefill the GraphQL console.
 */
export function buildGraphQLDocument(
  resolvers: ResolverInfo[],
  info: { title: string; version: string },
): any {
  return {
    generator: 'nest-scramble',
    info,
    resolvers: resolvers.map(resolver => ({
      name: resolver.name,
      typeName: resolver.typeName,
      operations: resolver.operations.map(operation => ({
        kind: operation.kind,
        name: operation.name,
        summary: operation.summary,
        description: operation.description,
        deprecated: operation.deprecated,
        args: operation.args.map(arg => ({
          name: arg.name,
          required: !arg.isOptional,
          schema: analyzedTypeToWsSchema(arg.type),
        })),
        response: analyzedTypeToWsSchema(operation.returnType),
        sample: buildSampleOperation(operation),
      })),
    })),
  };
}
