/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as path from 'path';
import { exec } from 'child_process';
import { AppPortDetector } from '../utils/AppPortDetector';
import { SpecMockServer } from './SpecMockServer';
import { renderDocsPage } from '../utils/DocsPageRenderer';
import { ScrambleLogger } from '../utils/ScrambleLogger';
import { AutoDetector, Framework } from '../utils/AutoDetector';
import { ScannerService } from '../scanner/ScannerService';
import { OpenApiTransformer } from '../utils/OpenApiTransformer';
import { ExpressScanner } from '../express/ExpressScanner';
import { ExpressOpenApiTransformer } from '../express/ExpressOpenApiTransformer';
import { ExpressWebSocketScanner } from '../express/ExpressWebSocketScanner';
import { ExpressGraphQLScanner } from '../express/ExpressGraphQLScanner';
import { buildWsDocument, GatewayScanner } from '../websocket/GatewayScanner';
import { buildGraphQLDocument, ResolverScanner } from '../graphql/ResolverScanner';

export interface StandaloneDocsOptions {
  sourcePath?: string;
  port?: number;
  title?: string;
  version?: string;
  baseUrl?: string;
  theme?: 'futuristic' | 'classic';
  primaryColor?: string;
  open?: boolean;
}

/**
 * Starts a self-contained documentation server for any supported project.
 *
 * - NestJS projects are scanned with the full TypeScript AST scanner.
 * - Express/Node.js projects are scanned with the heuristic route scanner.
 */
export interface StandaloneDocuments {
  framework: Framework;
  sourcePath: string;
  baseUrl: string;
  spec: any;
  wsDocument: any;
  graphqlDocument: any;
}

export class StandaloneDocsServer {
  private server?: http.Server;

  /**
   * Scans the project (NestJS or Express) into the three documents the UI
   * consumes. Shared by `serve` and `export` so both see the same API.
   */
  static buildDocuments(options: StandaloneDocsOptions = {}): StandaloneDocuments {
    const detector = AutoDetector.detectProjectStructure();
    const framework: Framework = detector.framework;
    const sourcePath = options.sourcePath || detector.sourcePath;

    ScrambleLogger.info(`Detected framework: ${framework || 'unknown'}`);

    // Where the *app* listens — read from .env / app.listen(...) so plain
    // `nest-scramble serve` already points "Try it" at the right place.
    let baseUrl = options.baseUrl;
    if (!baseUrl) {
      const detected = AppPortDetector.baseUrl(sourcePath);
      baseUrl = detected.url;
      const how = detected.detected.source === 'default'
        ? 'default — pass --baseUrl if your app listens elsewhere'
        : `from ${detected.detected.evidence}`;
      ScrambleLogger.info(`Backend base URL: ${baseUrl} (${how})`);
    }
    const globalPrefix = framework === 'nestjs' ? this.detectGlobalPrefix(sourcePath) : '';
    if (globalPrefix) ScrambleLogger.info(`Global prefix: /${globalPrefix}`);

    const title = options.title || detector.packageJson.name || (framework === 'nestjs' ? AutoDetector.getAppName() : 'Express API');
    const version = options.version || detector.packageJson.version || AutoDetector.getAppVersion();

    let spec: any;
    let wsDocument: any = { gateways: [] };
    let graphqlDocument: any = { resolvers: [] };

    if (framework === 'nestjs') {
      const controllers = new ScannerService().scanControllers(sourcePath);
      spec = new OpenApiTransformer(baseUrl, globalPrefix).transform(controllers, title, version, baseUrl);

      try {
        const gateways = new GatewayScanner().scanGateways(sourcePath);
        if (gateways.length) wsDocument = buildWsDocument(gateways, { title, version });
      } catch (error) {
        ScrambleLogger.warn(`Gateway scan failed: ${error instanceof Error ? error.message : error}`);
      }
      try {
        const resolvers = new ResolverScanner().scanResolvers(sourcePath);
        if (resolvers.length) graphqlDocument = buildGraphQLDocument(resolvers, { title, version });
      } catch (error) {
        ScrambleLogger.warn(`Resolver scan failed: ${error instanceof Error ? error.message : error}`);
      }
    } else if (framework === 'express') {
      const absoluteSource = path.resolve(sourcePath);
      const controllers = ExpressScanner.scan(absoluteSource);
      spec = new ExpressOpenApiTransformer().transform(controllers, title, version, baseUrl);

      const gateways = ExpressWebSocketScanner.scan(absoluteSource);
      if (gateways.length) wsDocument = { gateways };

      const resolvers = ExpressGraphQLScanner.scan(absoluteSource);
      if (resolvers.length) graphqlDocument = { resolvers };
    } else {
      throw new Error(
        'Could not detect project framework. Please run this command from a NestJS or Express project root.',
      );
    }

    return { framework, sourcePath, baseUrl, spec, wsDocument, graphqlDocument };
  }

  async start(options: StandaloneDocsOptions = {}): Promise<void> {
    const { spec, wsDocument, graphqlDocument, baseUrl } = StandaloneDocsServer.buildDocuments(options);

    // Never inherit PORT here: that is the application's port (see above).
    const requestedPort = options.port || 3001;
    const docsPath = 'docs';

    // The docs live on a different origin than the API, so a backend without
    // CORS would block every "Try it". The UI therefore sends REST/GraphQL
    // calls through this same-origin proxy; WebSockets connect directly.
    const proxyPrefix = '/__scramble_proxy';
    spec['x-scramble-proxy'] = proxyPrefix;

    const html = renderDocsPage({
      specUrl: `./${docsPath}-json`,
      title: options.title ? `${options.title} — API Documentation` : undefined,
      theme: options.theme,
      primaryColor: options.primaryColor,
    });

    const mock = new SpecMockServer(spec);
    const mockPrefix = '/scramble-mock';

    this.server = http.createServer((req, res) => {
      const url = req.url || '/';
      const pathname = url.split('?')[0];
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (pathname === proxyPrefix || pathname.startsWith(`${proxyPrefix}/`)) {
        this.proxy(req, res, baseUrl, url.slice(proxyPrefix.length) || '/');
        return;
      }

      if (pathname === mockPrefix || pathname.startsWith(`${mockPrefix}/`)) {
        const result = mock.handle(req.method || 'GET', pathname.slice(mockPrefix.length) || '/');
        if (!result) {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ statusCode: 404, message: `No documented route matches ${req.method} ${pathname.slice(mockPrefix.length) || '/'}` }));
          return;
        }
        const headers: Record<string, string> = { ...result.headers };
        if (result.body !== undefined) headers['Content-Type'] = 'application/json; charset=utf-8';
        res.writeHead(result.status, headers);
        res.end(result.body === undefined ? undefined : JSON.stringify(result.body));
        return;
      }

      if (url === `/${docsPath}` || url === `/${docsPath}/`) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(html);
      } else if (url === `/${docsPath}-json`) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(spec, null, 2));
      } else if (url === `/${docsPath}-ws-json`) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(wsDocument, null, 2));
      } else if (url === `/${docsPath}-graphql-json`) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(graphqlDocument, null, 2));
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found. Visit /docs');
      }
    });

    const port = await this.listenWithFallback(requestedPort, options.port === undefined);
    const url = `http://localhost:${port}/${docsPath}`;
    ScrambleLogger.info(`Standalone docs server running at ${url}`);
    ScrambleLogger.info(`Mock server: http://localhost:${port}${mockPrefix}  (e.g. ${mockPrefix}${Object.keys(spec.paths || {})[0] || '/'})`);
    if (options.open) this.openBrowser(url);
  }

  /**
   * Binds the docs server. When the user did not pin a port and the default is
   * busy (another docs server, or the app itself), walk up to the next free one
   * instead of crashing.
   */
  private listenWithFallback(port: number, allowFallback: boolean, attempt = 0): Promise<number> {
    return new Promise((resolve, reject) => {
      const onError = (err: NodeJS.ErrnoException) => {
        this.server!.off('error', onError);
        if (err.code === 'EADDRINUSE' && allowFallback && attempt < 20) {
          ScrambleLogger.warn(`Port ${port} is in use — trying ${port + 1}`);
          resolve(this.listenWithFallback(port + 1, allowFallback, attempt + 1));
        } else {
          reject(err);
        }
      };
      this.server!.once('error', onError);
      this.server!.listen(port, () => {
        this.server!.off('error', onError);
        resolve(port);
      });
    });
  }

  /**
   * Forwards one request to the backend and streams the answer back. Only
   * hop-by-hop headers are dropped; the backend's status, headers and body
   * reach the console untouched.
   */
  private proxy(req: http.IncomingMessage, res: http.ServerResponse, baseUrl: string, pathWithQuery: string): void {
    let target: URL;
    try {
      target = new URL(pathWithQuery, baseUrl.replace(/\/+$/, '') + '/');
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ statusCode: 400, message: 'Invalid proxy target' }));
      return;
    }

    const headers: http.OutgoingHttpHeaders = { ...req.headers, host: target.host };
    delete headers['origin'];
    delete headers['referer'];
    delete headers['connection'];
    delete headers['accept-encoding']; // keep the body readable as-is

    const client = target.protocol === 'https:' ? https : http;
    const upstream = client.request(
      { protocol: target.protocol, hostname: target.hostname, port: target.port || undefined, path: target.pathname + target.search, method: req.method, headers },
      (response) => {
        const outgoing: http.OutgoingHttpHeaders = { ...response.headers };
        delete outgoing['connection'];
        delete outgoing['transfer-encoding'];
        delete outgoing['access-control-allow-origin'];
        outgoing['access-control-allow-origin'] = '*';
        outgoing['x-scramble-proxied'] = target.origin;
        res.writeHead(response.statusCode || 502, outgoing);
        response.pipe(res);
      },
    );
    upstream.on('error', (err: NodeJS.ErrnoException) => {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        statusCode: 502,
        message: `Could not reach ${target.origin} — is your app running?`,
        hint: 'Start your application, or pass --baseUrl <url> if it listens somewhere else.',
        error: err.code || err.message,
      }));
    });
    req.pipe(upstream);
  }

  /** `app.setGlobalPrefix('api')` from the Nest bootstrap file, if any. */
  private static detectGlobalPrefix(sourcePath: string): string {
    const candidates = ['main.ts', 'main.js', 'app.ts', 'server.ts', 'index.ts'].map((f) => path.join(path.resolve(sourcePath), f));
    for (const file of candidates) {
      let text: string;
      try {
        text = fs.readFileSync(file, 'utf-8');
      } catch {
        continue;
      }
      const m = /setGlobalPrefix\s*\(\s*['"`]([^'"`]+)['"`]/.exec(text);
      if (m) return m[1].replace(/^\/+|\/+$/g, '');
    }
    return '';
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => resolve());
    });
  }

  private openBrowser(url: string): void {
    const command = process.platform === 'win32' ? `start "" "${url}"` : `open "${url}"`;
    try {
      exec(command);
    } catch {
      // Ignore browser-open failures.
    }
  }
}
