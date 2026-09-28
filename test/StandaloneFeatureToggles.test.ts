/**
 * Verifies that the standalone `serve` server lets the user turn docs, proxy and
 * mock on/off independently, and that the docs page ships safe default headers.
 */
import * as fs from 'fs';
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

  it('serves docs with security headers by default', async () => {
    const port = await start();
    const res = await fetch(`http://127.0.0.1:${port}/docs`);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('cache-control')).toContain('no-store');
  });

  it('returns 404 for docs when enableDocs is false', async () => {
    const port = await start({ enableDocs: false });
    const res = await fetch(`http://127.0.0.1:${port}/docs`);
    expect(res.status).toBe(404);
    const body = await res.json() as { message: string };
    expect(body.message).toMatch(/Docs UI is disabled/);
  });

  it('returns 404 for the proxy when enableProxy is false', async () => {
    const port = await start({ enableProxy: false });
    const res = await fetch(`http://127.0.0.1:${port}/__scramble_proxy/`);
    expect(res.status).toBe(404);
    const body = await res.json() as { message: string };
    expect(body.message).toMatch(/Proxy is disabled/);
  });

  it('returns 404 for the mock server when enableMock is false', async () => {
    const port = await start({ enableMock: false });
    const res = await fetch(`http://127.0.0.1:${port}/scramble-mock/`);
    expect(res.status).toBe(404);
    expect(await res.text()).toMatch(/Not found/);
  });

  it('still serves the OpenAPI JSON when docs UI is disabled', async () => {
    const port = await start({ enableDocs: false });
    const res = await fetch(`http://127.0.0.1:${port}/docs-json`);
    expect(res.status).toBe(200);
    const body = await res.json() as { openapi: string };
    expect(body.openapi).toBe('3.0.0');
  });
});
