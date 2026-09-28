/**
 * Verifies that the standalone `serve` server lets the user turn docs, proxy and
 * mock on/off independently, and that the docs page ships safe default headers.
 */
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { StandaloneDocsServer } from '../src/standalone/StandaloneDocsServer';
import { ScrambleLogger } from '../src/utils/ScrambleLogger';

describe('StandaloneDocsServer feature toggles', () => {
  jest.setTimeout(120_000);

  const originalCwd = process.cwd();
  let tempDir: string;
  let server: StandaloneDocsServer;

  beforeAll(() => {
    ScrambleLogger.configure('silent');
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-scramble-standalone-'));
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'fixture', dependencies: { express: '^4.18.0' } }),
    );
    fs.writeFileSync(
      path.join(tempDir, 'app.ts'),
      `import * as express from 'express';
const app = express();
app.get('/', (req, res) => res.json({ ok: true }));
app.listen(3000);
`,
    );
    process.chdir(tempDir);
  });

  afterEach(async () => {
    await server?.stop();
  });

  afterAll(() => {
    process.chdir(originalCwd);
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup.
    }
    ScrambleLogger.configure('info');
  });

  async function start(options: Record<string, unknown> = {}): Promise<number> {
    server = new StandaloneDocsServer();
    await server.start({ sourcePath: tempDir, port: 0, ...options });
    return ((server as unknown as { server: { address(): { port: number } } }).server.address()).port;
  }

  function get(port: number, path: string): Promise<{ status: number; headers: http.IncomingHttpHeaders; text: string }> {
    return new Promise((resolve, reject) => {
      const req = http.get(
        `http://127.0.0.1:${port}${path}`,
        { agent: false },
        (res) => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => { body += chunk; });
          res.on('end', () => {
            resolve({ status: res.statusCode || 0, headers: res.headers, text: body });
          });
        },
      );
      req.on('error', reject);
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error('Request timed out'));
      });
    });
  }

  it('serves docs with security headers by default', async () => {
    const port = await start();
    const res = await get(port, '/docs');
    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['cache-control']).toContain('no-store');
  });

  it('returns 404 for docs when enableDocs is false', async () => {
    const port = await start({ enableDocs: false });
    const res = await get(port, '/docs');
    expect(res.status).toBe(404);
    const body = JSON.parse(res.text) as { message: string };
    expect(body.message).toMatch(/Docs UI is disabled/);
  });

  it('returns 404 for the proxy when enableProxy is false', async () => {
    const port = await start({ enableProxy: false });
    const res = await get(port, '/__scramble_proxy/');
    expect(res.status).toBe(404);
    const body = JSON.parse(res.text) as { message: string };
    expect(body.message).toMatch(/Proxy is disabled/);
  });

  it('returns 404 for the mock server when enableMock is false', async () => {
    const port = await start({ enableMock: false });
    const res = await get(port, '/scramble-mock/');
    expect(res.status).toBe(404);
    expect(res.text).toMatch(/Not found/);
  });

  it('still serves the OpenAPI JSON when docs UI is disabled', async () => {
    const port = await start({ enableDocs: false });
    const res = await get(port, '/docs-json');
    expect(res.status).toBe(200);
    const body = JSON.parse(res.text) as { openapi: string };
    expect(body.openapi).toBe('3.0.0');
  });
});
