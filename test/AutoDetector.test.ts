/**
 * Tests for automatic project detection.
 *
 * This file sat at 6% coverage while being the most consequential untested code
 * in the library: it supplies the default `sourcePath` and the default `baseUrl`
 * for every user who does not configure them, and that `baseUrl` goes straight
 * into `servers[].url` of the generated document and into the docs UI.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AutoDetector } from '../src/utils/AutoDetector';
import { ScrambleLogger } from '../src/utils/ScrambleLogger';

/** Creates a throwaway project tree and returns its root. */
function makeProject(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scramble-detect-'));

  for (const [relative, contents] of Object.entries(files)) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }

  return root;
}

describe('AutoDetector.detectPort', () => {
  const original = process.env.PORT;

  beforeEach(() => {
    ScrambleLogger.configure('silent');
  });

  afterEach(() => {
    if (original === undefined) delete process.env.PORT;
    else process.env.PORT = original;
    ScrambleLogger.configure('info');
  });

  it('defaults to 3000 when PORT is unset', () => {
    delete process.env.PORT;
    expect(AutoDetector.detectPort()).toBe(3000);
  });

  it('reads a valid PORT', () => {
    process.env.PORT = '8080';
    expect(AutoDetector.detectPort()).toBe(8080);
  });

  it('tolerates surrounding whitespace', () => {
    process.env.PORT = ' 4000 ';
    expect(AutoDetector.detectPort()).toBe(4000);
  });

  it('falls back when PORT is not a number', () => {
    // `parseInt('abc')` returned NaN, which reached the URL as `localhost:NaN`.
    process.env.PORT = 'abc';
    expect(AutoDetector.detectPort()).toBe(3000);
  });

  it('rejects a trailing-garbage PORT instead of truncating it', () => {
    // `parseInt` would have accepted this as 8080.
    process.env.PORT = '8080abc';
    expect(AutoDetector.detectPort()).toBe(3000);
  });

  it.each(['0', '-1', '70000', '3.5'])('rejects the out-of-range value %s', (value) => {
    process.env.PORT = value;
    expect(AutoDetector.detectPort()).toBe(3000);
  });

  it('treats an empty PORT as unset', () => {
    process.env.PORT = '';
    expect(AutoDetector.detectPort()).toBe(3000);
  });
});

describe('AutoDetector.detectBaseUrl', () => {
  const originalPort = process.env.PORT;
  const originalHost = process.env.HOST;

  beforeEach(() => {
    ScrambleLogger.configure('silent');
    delete process.env.PORT;
    delete process.env.HOST;
  });

  afterEach(() => {
    if (originalPort === undefined) delete process.env.PORT;
    else process.env.PORT = originalPort;
    if (originalHost === undefined) delete process.env.HOST;
    else process.env.HOST = originalHost;
    ScrambleLogger.configure('info');
  });

  it('defaults to localhost:3000', () => {
    expect(AutoDetector.detectBaseUrl()).toBe('http://localhost:3000');
  });

  it('honours a real host', () => {
    process.env.HOST = 'api.internal';
    expect(AutoDetector.detectBaseUrl()).toBe('http://api.internal:3000');
  });

  it.each(['0.0.0.0', '::', '[::]', '::0', '0'])(
    'rewrites the wildcard bind address %s to localhost',
    (host) => {
      // `HOST=0.0.0.0` is standard in containers, but a browser cannot connect
      // to it. Copying it into the document made "Try it" unusable.
      process.env.HOST = host;
      expect(AutoDetector.detectBaseUrl()).toBe('http://localhost:3000');
    },
  );

  it('never produces NaN in the URL', () => {
    process.env.PORT = 'not-a-port';
    expect(AutoDetector.detectBaseUrl()).not.toContain('NaN');
  });

  it('combines host and port', () => {
    process.env.HOST = '127.0.0.1';
    process.env.PORT = '4444';
    expect(AutoDetector.detectBaseUrl()).toBe('http://127.0.0.1:4444');
  });

  it('treats a whitespace-only HOST as unset', () => {
    process.env.HOST = '   ';
    expect(AutoDetector.detectBaseUrl()).toBe('http://localhost:3000');
  });
});

describe('AutoDetector.detectProjectStructure', () => {
  const originalCwd = process.cwd();
  const roots: string[] = [];

  /** Runs detection with `cwd` pointed at a generated project. */
  function detectIn(files: Record<string, string>) {
    const root = makeProject(files);
    roots.push(root);
    process.chdir(root);
    return AutoDetector.detectProjectStructure();
  }

  beforeEach(() => {
    ScrambleLogger.configure('silent');
  });

  afterEach(() => {
    process.chdir(originalCwd);
    ScrambleLogger.configure('info');
  });

  afterAll(() => {
    for (const root of roots) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('detects a conventional src layout', () => {
    const result = detectIn({
      'package.json': '{"name":"demo","version":"2.0.0"}',
      'src/main.ts': 'export {};',
      'src/users.controller.ts': '@Controller() export class C {}',
    });

    expect(result.sourcePath).toBe('src');
    expect(result.hasControllers).toBe(true);
  });

  it('finds a source directory whose files are all nested', () => {
    // The old shallow check saw no top-level `.ts` and gave up, leaving the user
    // with "No controllers found" and no explanation.
    const result = detectIn({
      'package.json': '{}',
      'app/modules/users/users.controller.ts': '@Controller() export class C {}',
    });

    expect(result.sourcePath).toBe('app');
    expect(result.hasControllers).toBe(true);
  });

  it('prefers the directory that actually declares a controller', () => {
    const result = detectIn({
      'package.json': '{}',
      'src/helpers.ts': 'export {};',
      'lib/api/orders.controller.ts': '@Controller() export class C {}',
    });

    expect(result.sourcePath).toBe('lib');
  });

  it('falls back to a TypeScript directory when no controller exists', () => {
    const result = detectIn({
      'package.json': '{}',
      'src/main.ts': 'export {};',
    });

    expect(result.sourcePath).toBe('src');
    expect(result.hasControllers).toBe(false);
  });

  it('defaults to src when nothing matches', () => {
    const result = detectIn({ 'package.json': '{}' });

    expect(result.sourcePath).toBe('src');
    expect(result.hasControllers).toBe(false);
  });

  it('ignores build output and dependencies', () => {
    const result = detectIn({
      'package.json': '{}',
      'src/dist/old.controller.ts': 'stale',
      'src/node_modules/pkg/x.controller.ts': 'vendor',
      'src/real/new.controller.ts': '@Controller() export class C {}',
    });

    expect(result.controllerPaths).toHaveLength(1);
    expect(result.controllerPaths[0]).toContain('new.controller.ts');
  });

  it('reads package.json', () => {
    const result = detectIn({
      'package.json': '{"name":"my-api","version":"7.1.0"}',
      'src/main.ts': 'export {};',
    });

    expect(result.packageJson.name).toBe('my-api');
  });

  it('survives an unparseable package.json', () => {
    const result = detectIn({
      'package.json': '{ broken',
      'src/main.ts': 'export {};',
    });

    expect(result.packageJson).toEqual({});
    expect(result.sourcePath).toBe('src');
  });

  it('locates tsconfig.json when present', () => {
    const result = detectIn({
      'package.json': '{}',
      'tsconfig.json': '{}',
      'src/main.ts': 'export {};',
    });

    expect(result.tsConfigPath).toContain('tsconfig.json');
    expect(fs.existsSync(result.tsConfigPath)).toBe(true);
  });

  it('falls back to an alternative tsconfig name', () => {
    const result = detectIn({
      'package.json': '{}',
      'tsconfig.build.json': '{}',
      'src/main.ts': 'export {};',
    });

    expect(result.tsConfigPath).toContain('tsconfig.build.json');
  });
});

describe('AutoDetector package metadata', () => {
  const originalCwd = process.cwd();
  const roots: string[] = [];

  function inProject(files: Record<string, string>) {
    const root = makeProject(files);
    roots.push(root);
    process.chdir(root);
  }

  afterEach(() => {
    process.chdir(originalCwd);
  });

  afterAll(() => {
    for (const root of roots) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('reads the app name and version', () => {
    inProject({ 'package.json': '{"name":"billing-api","version":"3.4.5"}' });

    expect(AutoDetector.getAppName()).toBe('billing-api');
    expect(AutoDetector.getAppVersion()).toBe('3.4.5');
  });

  it('falls back when package.json is missing', () => {
    inProject({ 'src/main.ts': 'export {};' });

    expect(AutoDetector.getAppName()).toBe('NestJS API');
    expect(AutoDetector.getAppVersion()).toBe('1.0.0');
  });

  it('falls back when the fields are absent', () => {
    inProject({ 'package.json': '{"private":true}' });

    expect(AutoDetector.getAppName()).toBe('NestJS API');
    expect(AutoDetector.getAppVersion()).toBe('1.0.0');
  });
});
