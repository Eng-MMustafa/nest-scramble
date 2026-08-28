/**
 * End-to-end tests that boot a real NestJS application.
 *
 * These exist because unit tests cannot catch integration regressions such as:
 *   - the barrel import pulling in a dev-only dependency (v3.0.6 chokidar bug)
 *   - middleware route patterns being rejected by Express 5 / NestJS 11
 *   - the `path` option being silently ignored by a hard-coded @Get('docs')
 *
 * The CI matrix runs this file against both NestJS 10 and NestJS 11.
 */
import 'reflect-metadata';
import { INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestScrambleModule } from '../../src/NestScrambleModule';
import { getNestMajorVersion } from '../../src/utils/NestCompat';

const FIXTURE_SOURCE = 'test/fixtures/sample-app';

/** Silences the library's startup banner so test output stays readable. */
function withQuietConsole<T>(fn: () => T): T {
  const originalLog = console.log;
  console.log = () => undefined;
  try {
    return fn();
  } finally {
    console.log = originalLog;
  }
}

async function bootApp(options: Record<string, unknown> = {}): Promise<{
  app: INestApplication;
  baseUrl: string;
}> {
  const dynamicModule = withQuietConsole(() =>
    NestScrambleModule.forRoot({ sourcePath: FIXTURE_SOURCE, ...options }),
  );

  @Module({ imports: [dynamicModule] })
  class TestAppModule {}

  const app = await NestFactory.create(TestAppModule, { logger: false });
  await app.listen(0);
  const baseUrl = await app.getUrl();

  // getUrl() reports [::1] on some CI runners, which Node's fetch cannot use.
  return { app, baseUrl: baseUrl.replace('[::1]', '127.0.0.1') };
}

/** `Response.json()` returns `unknown` under strict mode. */
async function getJson<T = any>(url: string): Promise<{ status: number; body: T }> {
  const res = await fetch(url);
  return { status: res.status, body: (await res.json()) as T };
}

describe('NestScrambleModule (e2e)', () => {
  jest.setTimeout(120_000);

  describe('default configuration', () => {
    let app: INestApplication;
    let baseUrl: string;

    beforeAll(async () => {
      ({ app, baseUrl } = await bootApp());
    });

    afterAll(async () => {
      await app?.close();
    });

    it('boots without requiring optional dev dependencies', () => {
      // Reaching this point means forRoot() + NestFactory.create() succeeded.
      expect(app).toBeDefined();
    });

    it('serves the docs page at /docs', async () => {
      const res = await fetch(`${baseUrl}/docs`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');

      const html = await res.text();
      expect(html).toContain("SPEC_URL = '/docs-json'");
      // The WebSocket and GraphQL consoles ship with every docs page and
      // reveal themselves only when the matching document has entries.
      expect(html).toContain('id="ws-view"');
      expect(html).toContain('id="gql-view"');
      // The page must be self-contained: no CDN scripts, no external fonts.
      expect(html).not.toContain('<script src');
      expect(html).not.toContain('<link href');
      expect(html).not.toContain('fonts.googleapis.com');
      expect(html).not.toContain('cdn.');
    });

    it('serves a valid OpenAPI document at /docs-json', async () => {
      const { status, body: spec } = await getJson(`${baseUrl}/docs-json`);
      expect(status).toBe(200);

      expect(spec.openapi).toBe('3.0.0');
      expect(spec.paths['/users']).toBeDefined();
      expect(spec.paths['/users/{id}']).toBeDefined();
      expect(spec.paths['/users'].get).toBeDefined();
      expect(spec.paths['/users'].post).toBeDefined();
    });

    it('serves the spec at /docs/spec', async () => {
      const { status, body } = await getJson(`${baseUrl}/docs/spec`);
      expect(status).toBe(200);
      expect(body.openapi).toBe('3.0.0');
    });

    it('mounts the mock middleware without an invalid route pattern', async () => {
      // On NestJS 11 / Express 5 an anonymous `*` wildcard makes app.listen()
      // throw, so simply getting a response here proves the compat fix works.
      const { status, body } = await getJson(`${baseUrl}/scramble-mock/users/1`);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('email');
    });

    it('returns 404 from the mock for unknown routes', async () => {
      const res = await fetch(`${baseUrl}/scramble-mock/does-not-exist`);
      expect(res.status).toBe(404);
    });
  });

  describe('custom path option', () => {
    let app: INestApplication;
    let baseUrl: string;

    beforeAll(async () => {
      ({ app, baseUrl } = await bootApp({ path: '/api/reference' }));
    });

    afterAll(async () => {
      await app?.close();
    });

    it('serves docs at the configured path instead of /docs', async () => {
      const res = await fetch(`${baseUrl}/api/reference`);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain("SPEC_URL = '/api/reference-json'");
    });

    it('points the UI at the matching spec URL', async () => {
      const html = await (await fetch(`${baseUrl}/api/reference`)).text();
      expect(html).toContain('href="/api/reference-json"');
    });

    it('serves the spec under the configured path', async () => {
      const { status, body } = await getJson(`${baseUrl}/api/reference-json`);
      expect(status).toBe(200);
      expect(body.openapi).toBe('3.0.0');
    });

    it('no longer serves the default /docs path', async () => {
      const res = await fetch(`${baseUrl}/docs`);
      expect(res.status).toBe(404);
    });
  });

  describe('theme option', () => {
    it('renders dark mode for the futuristic theme', async () => {
      const { app, baseUrl } = await bootApp({ theme: 'futuristic' });
      try {
        const html = await (await fetch(`${baseUrl}/docs`)).text();
        expect(html).toContain('data-theme="dark"');
      } finally {
        await app.close();
      }
    });

    it('renders light mode for the classic theme', async () => {
      const { app, baseUrl } = await bootApp({ theme: 'classic' });
      try {
        const html = await (await fetch(`${baseUrl}/docs`)).text();
        expect(html).toContain('data-theme="light"');
      } finally {
        await app.close();
      }
    });
  });

  describe('enableMock: false', () => {
    it('does not mount the mock middleware', async () => {
      const { app, baseUrl } = await bootApp({ enableMock: false });
      try {
        const res = await fetch(`${baseUrl}/scramble-mock/users/1`);
        expect(res.status).toBe(404);
      } finally {
        await app.close();
      }
    });
  });

  describe('globalPrefix option', () => {
    let app: INestApplication;
    let baseUrl: string;

    beforeAll(async () => {
      ({ app, baseUrl } = await bootApp({ globalPrefix: 'api' }));
    });

    afterAll(async () => {
      await app?.close();
    });

    it('documents the prefixed paths', async () => {
      const { body: spec } = await getJson(`${baseUrl}/docs-json`);
      expect(spec.paths['/api/users']).toBeDefined();
      expect(spec.paths['/users']).toBeUndefined();
    });

    it('serves the mock on the prefixed path', async () => {
      // The mock used to build paths without the prefix, so every documented
      // path returned 404 from the mock as soon as a prefix was configured.
      const { status } = await getJson(`${baseUrl}/scramble-mock/api/users/1`);
      expect(status).toBe(200);
    });

    it('does not serve the mock on the unprefixed path', async () => {
      const res = await fetch(`${baseUrl}/scramble-mock/users/1`);
      expect(res.status).toBe(404);
    });
  });

  describe('spec and mock parity', () => {
    /**
     * Structural invariant: the mock must answer on every path the document
     * advertises. The two used to build paths independently and drifted apart,
     * so this asserts the relationship rather than individual cases.
     */
    it.each([{}, { globalPrefix: 'api' }])(
      'answers every documented GET path (options: %j)',
      async (options) => {
        const { app, baseUrl } = await bootApp(options);

        try {
          const { body: spec } = await getJson(`${baseUrl}/docs-json`);
          const documented = Object.entries<Record<string, unknown>>(spec.paths)
            .filter(([, operations]) => 'get' in operations)
            .map(([path]) => path);

          expect(documented.length).toBeGreaterThan(0);

          for (const path of documented) {
            const concrete = path.replace(/\{[^}]+\}/g, '1');
            const res = await fetch(`${baseUrl}/scramble-mock${concrete}`);

            expect(res.status).not.toBe(404);
          }
        } finally {
          await app.close();
        }
      },
    );
  });

  describe('NestCompat', () => {
    it('detects the installed NestJS major version', () => {
      const major = getNestMajorVersion();
      expect(major).not.toBeNull();
      expect(major).toBeGreaterThanOrEqual(10);
    });
  });
});
