/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import { Buffer } from 'buffer';
import { Inject, Injectable, NestMiddleware } from '@nestjs/common';
import { ScrambleLogger } from '../utils/ScrambleLogger';
import { checkDrift, DriftFinding } from './DriftDetector';

/** Responses larger than this are not buffered — drift checks sample, not audit. */
const MAX_CAPTURE_BYTES = 256 * 1024;

/** Paths owned by the library itself; checking them would be circular. */
const IGNORED_PREFIXES = ['/docs', '/scramble-mock', '/favicon'];

/**
 * Samples real responses in development and compares them with the generated
 * OpenAPI document.
 *
 * This closes the one trust gap of static docs: "does the running API actually
 * return what the docs promise?". Each unique finding is logged once — the
 * middleware must never turn the console into a firehose.
 *
 * Enabled via `enableDriftDetection: true`. Not meant for production traffic:
 * it buffers response bodies (bounded) to inspect them.
 */
@Injectable()
export class DriftMiddleware implements NestMiddleware {
  /** One log line per unique (route, issue) pair for the process lifetime. */
  private readonly reported = new Set<string>();
  /** Recent findings, newest first, bounded. */
  static readonly findings: DriftFinding[] = [];

  constructor(@Inject('NEST_SCRAMBLE_OPENAPI') private readonly spec: any) {}

  use(req: any, res: any, next: any) {
    const path = this.requestPath(req);

    if (IGNORED_PREFIXES.some(prefix => path === prefix || path.startsWith(prefix + '-') || path.startsWith(prefix + '/'))) {
      return next();
    }

    const chunks: Buffer[] = [];
    let captured = 0;
    let overflow = false;

    const originalWrite = res.write;
    const originalEnd = res.end;
    const self = this;

    res.write = function (chunk: any, ...rest: any[]) {
      capture(chunk);
      return originalWrite.call(this, chunk, ...rest);
    };

    res.end = function (chunk: any, ...rest: any[]) {
      capture(chunk);
      const result = originalEnd.call(this, chunk, ...rest);
      try {
        self.inspect(req.method || 'GET', path, res, chunks, overflow);
      } catch (error) {
        ScrambleLogger.debug(`Drift check failed: ${error instanceof Error ? error.message : error}`);
      }
      return result;
    };

    function capture(chunk: any) {
      if (overflow || chunk == null || typeof chunk === 'function') return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      captured += buffer.length;
      if (captured > MAX_CAPTURE_BYTES) {
        overflow = true;
        chunks.length = 0;
        return;
      }
      chunks.push(buffer);
    }

    next();
  }

  private requestPath(req: any): string {
    if (typeof req?.path === 'string') return req.path;
    const url: string = req?.originalUrl ?? req?.url ?? '';
    const queryStart = url.indexOf('?');
    return queryStart === -1 ? url : url.slice(0, queryStart);
  }

  private inspect(method: string, path: string, res: any, chunks: Buffer[], overflow: boolean): void {
    if (overflow || chunks.length === 0) return;

    const contentType = String(res.getHeader?.('content-type') || '');
    if (contentType.indexOf('application/json') === -1) return;

    let body: unknown;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
    } catch {
      return;
    }

    const issues = checkDrift(this.spec, method, path, res.statusCode, body);
    if (issues.length === 0) return;

    const fresh = issues.filter(issue => {
      const signature = `${method} ${path} ${res.statusCode} ${issue.kind} ${issue.location}`;
      if (this.reported.has(signature)) return false;
      this.reported.add(signature);
      return true;
    });
    if (fresh.length === 0) return;

    DriftMiddleware.findings.unshift({
      method: method.toUpperCase(),
      path,
      status: res.statusCode,
      issues: fresh,
      at: new Date().toISOString(),
    });
    if (DriftMiddleware.findings.length > 100) DriftMiddleware.findings.length = 100;

    ScrambleLogger.warn(
      `Drift detected — ${method.toUpperCase()} ${path} (${res.statusCode}):\n` +
        fresh.map(issue => `  • [${issue.kind}] ${issue.location}: ${issue.message}`).join('\n'),
    );
  }
}
