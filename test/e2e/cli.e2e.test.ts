/**
 * End-to-end tests for the CLI binary.
 *
 * These spawn the real built `dist/cli.js` rather than calling the action
 * handlers in process, because the contract that matters here is the **process
 * exit code**: `--fail-on-breaking` is what a CI job keys off. If that ever
 * returned 0 on a breaking change, every consumer's gate would silently stop
 * working while still reporting success. An in-process test cannot verify it.
 */
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const CLI = path.resolve(__dirname, '../../dist/cli.js');

interface CliResult {
  status: number;
  stdout: string;
  stderr: string;
}

/** Runs the CLI and captures its exit code and output. */
function runCli(args: string[], cwd?: string): CliResult {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf-8',
    cwd: cwd ?? path.resolve(__dirname, '../..'),
  });

  return {
    status: result.status ?? -1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

/** Minimal document with one operation carrying a single string field. */
function specWith(field: Record<string, any>, required: string[] = ['email']) {
  return {
    openapi: '3.0.0',
    info: { title: 'Demo', version: '1.0.0', description: '' },
    paths: {
      '/users': {
        post: {
          summary: 'create',
          responses: { '201': { description: 'Created' } },
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object', properties: field, required },
              },
            },
          },
        },
      },
    },
    components: { schemas: {} },
  };
}

describe('CLI (e2e)', () => {
  jest.setTimeout(180_000);

  let workDir: string;
  let basePath: string;
  let samePath: string;
  let breakingPath: string;
  let safePath: string;

  const write = (name: string, value: unknown): string => {
    const target = path.join(workDir, name);
    fs.writeFileSync(target, JSON.stringify(value, null, 2));
    return target;
  };

  beforeAll(() => {
    if (!fs.existsSync(CLI)) {
      throw new Error(`dist/cli.js not found. Run "npm run build" before the e2e suite.`);
    }

    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scramble-cli-'));

    const base = specWith({ email: { type: 'string', maxLength: 255 } });
    basePath = write('base.json', base);
    samePath = write('same.json', base);

    // Tightening a constraint is breaking for callers.
    breakingPath = write('breaking.json', specWith({ email: { type: 'string', maxLength: 120 } }));

    // A new optional field is additive.
    safePath = write(
      'safe.json',
      specWith(
        { email: { type: 'string', maxLength: 255 }, nickname: { type: 'string' } },
        ['email'],
      ),
    );
  });

  afterAll(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  describe('exit codes', () => {
    it('exits 0 when nothing changed', () => {
      const result = runCli(['diff', basePath, samePath]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('No API changes detected.');
    });

    it('exits 1 on a breaking change with --fail-on-breaking', () => {
      // The contract a CI job depends on.
      const result = runCli(['diff', basePath, breakingPath, '--fail-on-breaking']);

      expect(result.status).toBe(1);
      expect(result.stdout).toContain('BREAKING');
    });

    it('exits 0 on a breaking change without the flag', () => {
      // Reporting must stay separate from gating.
      const result = runCli(['diff', basePath, breakingPath]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('BREAKING');
    });

    it('exits 0 for a safe change even with --fail-on-breaking', () => {
      const result = runCli(['diff', basePath, safePath, '--fail-on-breaking']);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('SAFE');
    });

    it('exits 1 with a clear message when a path does not exist', () => {
      const result = runCli(['diff', basePath, path.join(workDir, 'nope.json')]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Path not found');
    });
  });

  describe('output formats', () => {
    it('emits parseable JSON on stdout', () => {
      // Library logging is lowered during `diff` precisely so the report can be
      // piped; a stray banner would make this throw.
      const result = runCli(['diff', basePath, breakingPath, '--format', 'json']);

      const parsed = JSON.parse(result.stdout);
      expect(parsed.hasBreaking).toBe(true);
      expect(parsed.summary.breaking).toBeGreaterThan(0);
      expect(Array.isArray(parsed.changes)).toBe(true);
    });

    it('emits markdown headings', () => {
      const result = runCli(['diff', basePath, breakingPath, '--format', 'markdown']);

      expect(result.stdout).toContain('## API diff');
      expect(result.stdout).toContain('### Breaking changes');
    });

    it('writes the report to a file', () => {
      const output = path.join(workDir, 'report.md');
      const result = runCli([
        'diff',
        basePath,
        breakingPath,
        '--format',
        'markdown',
        '--output',
        output,
      ]);

      expect(result.status).toBe(0);
      expect(fs.existsSync(output)).toBe(true);
      expect(fs.readFileSync(output, 'utf-8')).toContain('### Breaking changes');
    });
  });

  describe('diffing source directories', () => {
    /**
     * The capability that makes the command usable on a pull request: no
     * application is booted, so no database or environment is needed.
     */
    it('compares two source trees without booting anything', () => {
      const result = runCli(['diff', 'test/fixtures/sample-app', 'test/fixtures/sample-app']);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('No API changes detected.');
    });

    it('detects a real breaking change between two source trees', () => {
      const variantDir = path.join(workDir, 'variant');
      fs.mkdirSync(variantDir, { recursive: true });

      // Copy the fixture, then delete one controller to remove its endpoints.
      const fixtureDir = path.resolve(__dirname, '../fixtures/sample-app');
      fs.cpSync(fixtureDir, variantDir, { recursive: true });

      for (const entry of fs.readdirSync(variantDir)) {
        if (entry.endsWith('.controller.ts')) {
          fs.rmSync(path.join(variantDir, entry));
        }
      }

      const result = runCli(['diff', fixtureDir, variantDir, '--fail-on-breaking']);

      expect(result.status).toBe(1);
      expect(result.stdout).toContain('BREAKING');
    });

    it('applies --globalPrefix when generating from source', () => {
      const result = runCli([
        'diff',
        'test/fixtures/sample-app',
        'test/fixtures/sample-app',
        '--globalPrefix',
        'api',
      ]);

      // Both sides get the prefix, so the contract is unchanged.
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('No API changes detected.');
    });
  });

  describe('generate', () => {
    it('writes an OpenAPI document', () => {
      const output = path.join(workDir, 'openapi.json');
      const result = runCli(['generate', 'test/fixtures/sample-app', '-o', output]);

      expect(result.status).toBe(0);

      const spec = JSON.parse(fs.readFileSync(output, 'utf-8'));
      expect(spec.openapi).toBe('3.0.0');
      expect(spec.paths['/users']).toBeDefined();
    });

    it('writes a Postman collection', () => {
      const output = path.join(workDir, 'collection.json');
      const result = runCli([
        'generate',
        'test/fixtures/sample-app',
        '--format',
        'postman',
        '-o',
        output,
      ]);

      expect(result.status).toBe(0);

      const collection = JSON.parse(fs.readFileSync(output, 'utf-8'));
      expect(collection.info.schema).toContain('schema.getpostman.com');
    });

    it('writes a typed client', () => {
      const output = path.join(workDir, 'api-client.ts');
      const result = runCli([
        'generate',
        'test/fixtures/sample-app',
        '--format',
        'client',
        '-o',
        output,
      ]);

      expect(result.status).toBe(0);

      const client = fs.readFileSync(output, 'utf-8');
      expect(client).toContain('export class');
      expect(client).toContain('fetch(');
    });

    it('applies --globalPrefix to the generated paths', () => {
      const output = path.join(workDir, 'prefixed.json');
      runCli(['generate', 'test/fixtures/sample-app', '-o', output, '--globalPrefix', 'api/v1']);

      const spec = JSON.parse(fs.readFileSync(output, 'utf-8'));
      expect(spec.paths['/api/v1/users']).toBeDefined();
      expect(spec.paths['/users']).toBeUndefined();
    });
  });

  describe('init', () => {
    const bareModule = [
      "import { Module } from '@nestjs/common';",
      "import { UsersModule } from './users/users.module';",
      '',
      '@Module({',
      '  imports: [UsersModule],',
      '})',
      'export class AppModule {}',
      '',
    ].join('\n');

    const writeModule = (name: string, content: string): string => {
      const target = path.join(workDir, name);
      fs.writeFileSync(target, content);
      return target;
    };

    it('injects the import and forRoot() into a bare module', () => {
      const target = writeModule('bare.module.ts', bareModule);
      const result = runCli(['init', '--module', target]);

      expect(result.status).toBe(0);
      const patched = fs.readFileSync(target, 'utf-8');
      expect(patched).toContain("import { NestScrambleModule } from 'nest-scramble';");
      expect(patched).toContain('NestScrambleModule.forRoot(),');
      // The import lands after the existing imports, not inside the decorator.
      expect(patched.indexOf('nest-scramble')).toBeLessThan(patched.indexOf('@Module'));
    });

    it('is idempotent: a second run changes nothing', () => {
      const target = writeModule('idempotent.module.ts', bareModule);
      runCli(['init', '--module', target]);
      const afterFirst = fs.readFileSync(target, 'utf-8');

      const second = runCli(['init', '--module', target]);

      expect(second.status).toBe(0);
      expect(second.stdout).toContain('already imported');
      expect(fs.readFileSync(target, 'utf-8')).toBe(afterFirst);
    });

    it('does not inject a duplicate when the module uses require()', () => {
      // Projects worked around older typings with a require() call; that is
      // still an installation and must not receive a second forRoot().
      const requireModule = bareModule.replace(
        "import { Module } from '@nestjs/common';",
        [
          "import { Module } from '@nestjs/common';",
          "const { NestScrambleModule } = require('nest-scramble');",
        ].join('\n'),
      );
      const target = writeModule('require.module.ts', requireModule);

      const result = runCli(['init', '--module', target]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('already imported');
      expect(fs.readFileSync(target, 'utf-8')).toBe(requireModule);
    });
  });

  describe('meta', () => {
    it('reports the package version', () => {
      const expected = require('../../package.json').version;
      const result = runCli(['--version']);

      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe(expected);
    });

    it('documents the diff command in --help', () => {
      const result = runCli(['--help']);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('diff');
    });
  });
});
