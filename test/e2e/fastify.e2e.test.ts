/**
 * End-to-end tests against a real Fastify application.
 *
 * The library previously worked only on Express. The docs controller called
 * `res.setHeader()` and `res.status().json()`, and the mock middleware read
 * `req.path` — all Express-specific. On Fastify the docs routes threw and the
 * mock was unreachable, even though NestJS supports the adapter as a first-class
 * option.
 *
 * The fix was not adapter sniffing: the controller now uses Nest's declarative
 * `@Header()` and returns its payload, and the middleware uses the raw Node HTTP
 * API. Both are understood by every adapter. These tests hold that in place.
 */
import 'reflect-metadata';
import { INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { NestScrambleModule } from '../../src/NestScrambleModule';
import { ScrambleLogger } from '../../src/utils/ScrambleLogger';

const FIXTURE_SOURCE = 'test/fixtures/sample-app';

async function bootFastifyApp(options: Record<string, unknown> = {}): Promise<{
  app: INestApplication;
  baseUrl: string;
}> {
  ScrambleLogger.configure('silent');

  const dynamicModule = NestScrambleModule.forRoot({ sourcePath: FIXTURE_SOURCE, ...options });

  @Module({ imports: [dynamicModule] })
  class FastifyTestModule {}

  const app = await NestFactory.create<NestFastifyApplication>(
    FastifyTestModule,
    new FastifyAdapter(),
    { logger: false },
  );

  // Fastify binds to localhost only unless told otherwise.
  await app.listen(0, '127.0.0.1');
  const baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  return { app, baseUrl };
}

async function getJson<T = any>(url: string): Promise<{ status: number; body: T }> {
  const res = await fetch(url);
  return { status: res.status, body: (await res.json()) as T };
}

describe('NestScrambleModule on Fastify (e2e)', () => {
  jest.setTimeout(120_000);

  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    ({ app, baseUrl } = await bootFastifyApp());
  });

  afterAll(async () => {
    await app?.close();
    ScrambleLogger.configure('info');
  });

  it('boots on the Fastify adapter', () => {
    expect(app).toBeDefined();
  });

  describe('documentation routes', () => {
    it('serves the docs page as HTML', async () => {
      // `res.setHeader` does not exist on a Fastify reply, so this used to throw.
      const res = await fetch(`${baseUrl}/docs`);

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
      expect(await res.text()).toContain('id="api-reference"');
    });

    it('serves a valid OpenAPI document', async () => {
      const { status, body: spec } = await getJson(`${baseUrl}/docs-json`);

      expect(status).toBe(200);
      expect(spec.openapi).toBe('3.0.0');
      expect(spec.paths['/users']).toBeDefined();
      expect(spec.paths['/users/{id}']).toBeDefined();
    });

    it('keeps the JSON content type and CORS header', async () => {
      const res = await fetch(`${baseUrl}/docs-json`);

      expect(res.headers.get('content-type')).toContain('application/json');
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
    });

    it('serves the legacy spec routes', async () => {
      expect((await getJson(`${baseUrl}/docs/json`)).body.openapi).toBe('3.0.0');
      expect((await getJson(`${baseUrl}/docs/spec`)).body.openapi).toBe('3.0.0');
    });

    it('pretty-prints the document so it is readable in a browser', async () => {
      const text = await (await fetch(`${baseUrl}/docs-json`)).text();
      expect(text).toContain('\n  ');
    });
  });

  describe('mock middleware', () => {
    it('answers a documented route', async () => {
      // Fastify hands middleware the raw Node request, which has no `path`.
      const { status, body } = await getJson(`${baseUrl}/scramble-mock/users/1`);

      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('email');
    });

    it('ignores a query string when matching', async () => {
      const { status } = await getJson(`${baseUrl}/scramble-mock/users?page=2`);
      expect(status).toBe(200);
    });

    it('returns 404 for an unknown route', async () => {
      const res = await fetch(`${baseUrl}/scramble-mock/does-not-exist`);
      expect(res.status).toBe(404);
    });

    it('does not intercept the real application routes', async () => {
      // The fixture is never mounted, so Fastify itself must answer 404 here.
      const res = await fetch(`${baseUrl}/users`);
      expect(res.status).toBe(404);
    });
  });

  describe('configuration parity with Express', () => {
    it('honours the path option', async () => {
      const { app: custom, baseUrl: customUrl } = await bootFastifyApp({ path: '/api/reference' });

      try {
        const res = await fetch(`${customUrl}/api/reference`);
        expect(res.status).toBe(200);
        expect(await res.text()).toContain('data-url="/api/reference-json"');
      } finally {
        await custom.close();
      }
    });

    it('honours the globalPrefix option in both the document and the mock', async () => {
      const { app: prefixed, baseUrl: prefixedUrl } = await bootFastifyApp({ globalPrefix: 'api' });

      try {
        const { body: spec } = await getJson(`${prefixedUrl}/docs-json`);
        expect(spec.paths['/api/users']).toBeDefined();

        const mocked = await fetch(`${prefixedUrl}/scramble-mock/api/users/1`);
        expect(mocked.status).toBe(200);
      } finally {
        await prefixed.close();
      }
    });

    it('honours enableMock: false', async () => {
      const { app: noMock, baseUrl: noMockUrl } = await bootFastifyApp({ enableMock: false });

      try {
        const res = await fetch(`${noMockUrl}/scramble-mock/users/1`);
        expect(res.status).toBe(404);
      } finally {
        await noMock.close();
      }
    });
  });
});
