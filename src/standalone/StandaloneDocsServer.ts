/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { renderDocsPage } from '../utils/DocsPageRenderer';
import { ScrambleLogger } from '../utils/ScrambleLogger';
import { AutoDetector, Framework } from '../utils/AutoDetector';
import { ScannerService } from '../scanner/ScannerService';
import { OpenApiTransformer } from '../utils/OpenApiTransformer';
import { ExpressScanner } from '../express/ExpressScanner';
import { ExpressOpenApiTransformer } from '../express/ExpressOpenApiTransformer';

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
export class StandaloneDocsServer {
  private server?: http.Server;

  async start(options: StandaloneDocsOptions = {}): Promise<void> {
    const detector = AutoDetector.detectProjectStructure();
    const framework: Framework = detector.framework;
    const sourcePath = options.sourcePath || detector.sourcePath;

    ScrambleLogger.info(`Detected framework: ${framework || 'unknown'}`);

    let spec: any;
    if (framework === 'nestjs') {
      const scanner = new ScannerService();
      const controllers = scanner.scanControllers(sourcePath);
      const transformer = new OpenApiTransformer(
        options.baseUrl || AutoDetector.detectBaseUrl(),
        '',
      );
      spec = transformer.transform(
        controllers,
        options.title || detector.packageJson.name || AutoDetector.getAppName(),
        options.version || detector.packageJson.version || AutoDetector.getAppVersion(),
        options.baseUrl || AutoDetector.detectBaseUrl(),
      );
    } else if (framework === 'express') {
      const controllers = ExpressScanner.scan(path.resolve(sourcePath));
      const transformer = new ExpressOpenApiTransformer();
      spec = transformer.transform(
        controllers,
        options.title || detector.packageJson.name || 'Express API',
        options.version || detector.packageJson.version || AutoDetector.getAppVersion(),
        options.baseUrl || AutoDetector.detectBaseUrl(),
      );
    } else {
      throw new Error(
        'Could not detect project framework. Please run this command from a NestJS or Express project root.',
      );
    }

    const port = options.port || Number(process.env.PORT) || 3001;
    const docsPath = 'docs';
    const docsUrl = `http://localhost:${port}`;
    const proxyTarget = options.baseUrl ? this.parseBaseUrl(options.baseUrl) : null;

    // When a proxy target is supplied, point the spec at the docs server so
    // "Try it" requests hit us and are forwarded to the real API. This avoids
    // cross-origin issues and makes standalone docs work with one command.
    if (proxyTarget && spec.servers?.[0]) {
      spec.servers[0].url = docsUrl;
    }

    const html = renderDocsPage({
      specUrl: `./${docsPath}-json`,
      title: options.title ? `${options.title} — API Documentation` : undefined,
      theme: options.theme,
      primaryColor: options.primaryColor,
    });

    this.server = http.createServer((req, res) => {
      const url = req.url || '/';
      res.setHeader('Access-Control-Allow-Origin', '*');

      if (url === `/${docsPath}` || url === `/${docsPath}/`) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(html);
      } else if (url === `/${docsPath}-json`) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(spec, null, 2));
      } else if (url === `/${docsPath}-ws-json`) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ gateways: [] }, null, 2));
      } else if (url === `/${docsPath}-graphql-json`) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ resolvers: [] }, null, 2));
      } else if (proxyTarget) {
        this.proxyRequest(req, res, proxyTarget);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found. Visit /docs');
      }
    });

    return new Promise((resolve, reject) => {
      this.server!.listen(port, () => {
        const url = `http://localhost:${port}/${docsPath}`;
        ScrambleLogger.info(`Standalone docs server running at ${url}`);
        if (options.open) {
          this.openBrowser(url);
        }
        resolve();
      });
      this.server!.on('error', reject);
    });
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
      require('child_process').exec(command);
    } catch {
      // Ignore browser-open failures.
    }
  }

  private parseBaseUrl(raw: string): { protocol: string; hostname: string; port: number; path: string } {
    const url = new URL(raw);
    return {
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port ? Number(url.port) : (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
    };
  }

  private proxyRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    target: { protocol: string; hostname: string; port: number; path: string },
  ): void {
    const options: http.RequestOptions = {
      hostname: target.hostname,
      port: target.port,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: target.hostname },
    };

    const protocol = target.protocol === 'https:' ? require('https') : http;
    const proxyReq = protocol.request(options, (proxyRes: http.IncomingMessage) => {
      res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    });

    proxyReq.on('error', (error: Error) => {
      ScrambleLogger.error(`Proxy error: ${error.message}`);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end(`Could not reach API at ${target.protocol}//${target.hostname}:${target.port}`);
      }
    });

    req.pipe(proxyReq, { end: true });
  }
}
