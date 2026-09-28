/**
 * Verifies the secure-by-default behavior introduced in v6.0.0:
 * - Docs and mock are enabled by default in development.
 * - Docs and mock are disabled by default in production unless explicitly opted in.
 * - Explicit opt-in in production still works.
 */
import { NestScrambleModule } from '../src/NestScrambleModule';
import { ScrambleLogger } from '../src/utils/ScrambleLogger';

describe('secure-by-default module behavior', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('enables docs and mock by default outside production', () => {
    process.env.NODE_ENV = 'development';
    const mod = NestScrambleModule.forRoot({ sourcePath: 'test/fixtures/sample-app' });
    expect(mod.controllers?.length).toBeGreaterThan(0);
  });

  it('disables docs and mock by default in production', () => {
    process.env.NODE_ENV = 'production';
    const mod = NestScrambleModule.forRoot({ sourcePath: 'test/fixtures/sample-app' });
    expect(mod.controllers).toEqual([]);
  });

  it('allows explicit opt-in for docs in production', () => {
    process.env.NODE_ENV = 'production';
    const mod = NestScrambleModule.forRoot({
      sourcePath: 'test/fixtures/sample-app',
      enableDocs: true,
    });
    expect(mod.controllers?.length).toBeGreaterThan(0);
  });

  it('allows explicit opt-out for docs outside production', () => {
    process.env.NODE_ENV = 'development';
    const mod = NestScrambleModule.forRoot({
      sourcePath: 'test/fixtures/sample-app',
      enableDocs: false,
    });
    expect(mod.controllers).toEqual([]);
  });

  it('detects common PaaS production environments', () => {
    delete process.env.NODE_ENV;
    process.env.RENDER = 'true';
    const mod = NestScrambleModule.forRoot({ sourcePath: 'test/fixtures/sample-app' });
    expect(mod.controllers).toEqual([]);
    delete process.env.RENDER;
  });
});
