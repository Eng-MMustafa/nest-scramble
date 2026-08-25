/**
 * Guards the published artifact.
 *
 * A packaging mistake is the only class of defect that breaks *every* consumer
 * at install time while every other test still passes, because the test suite
 * runs against the working tree rather than against what `npm publish` uploads.
 * These tests inspect the real tarball manifest instead.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));

interface PackedFile {
  path: string;
  size: number;
}

/** Asks npm exactly which files a publish would upload. */
function packedFiles(): PackedFile[] {
  const raw = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: ROOT,
    encoding: 'utf-8',
    shell: process.platform === 'win32',
  });

  return JSON.parse(raw)[0].files as PackedFile[];
}

describe('published package (e2e)', () => {
  jest.setTimeout(180_000);

  let files: PackedFile[];
  let paths: Set<string>;

  beforeAll(() => {
    if (!fs.existsSync(path.join(ROOT, 'dist'))) {
      throw new Error('dist/ not found. Run "npm run build" before the e2e suite.');
    }

    files = packedFiles();
    // npm reports POSIX separators regardless of platform.
    paths = new Set(files.map((f) => f.path.replace(/\\/g, '/')));
  });

  describe('manifest entry points', () => {
    it('ships the file named by "main"', () => {
      expect(paths.has(manifest.main)).toBe(true);
    });

    it('ships the file named by "types"', () => {
      expect(paths.has(manifest.types)).toBe(true);
    });

    it('ships every file named by "bin"', () => {
      for (const target of Object.values<string>(manifest.bin)) {
        expect(paths.has(target)).toBe(true);
      }
    });

    it('gives every bin target a shebang', () => {
      // Without this line the CLI is not executable on Unix, so `npx
      // nest-scramble` fails for everyone while working fine on Windows.
      for (const target of Object.values<string>(manifest.bin)) {
        const first = fs.readFileSync(path.join(ROOT, target), 'utf-8').split('\n')[0];
        expect(first).toBe('#!/usr/bin/env node');
      }
    });
  });

  describe('source maps', () => {
    /**
     * Maps were shipped for a long time while `src/` was not, so every one of
     * them pointed at a file the consumer did not have: 38% of the package
     * weight, and a debugger that could only report "source not found".
     */
    const mapSources = (mapPath: string): string[] => {
      const map = JSON.parse(fs.readFileSync(path.join(ROOT, mapPath), 'utf-8'));
      if (map.sourcesContent?.length) return [];

      return (map.sources as string[]).map((source) =>
        path.posix.normalize(path.posix.join(path.posix.dirname(mapPath), source)),
      );
    };

    it('ships at least one map, so the assertions below are meaningful', () => {
      expect([...paths].some((p) => p.endsWith('.map'))).toBe(true);
    });

    it('resolves every source referenced by a .js.map', () => {
      const broken: string[] = [];

      for (const file of [...paths].filter((p) => p.endsWith('.js.map'))) {
        for (const source of mapSources(file)) {
          if (!paths.has(source)) broken.push(`${file} -> ${source}`);
        }
      }

      expect(broken).toEqual([]);
    });

    it('resolves every source referenced by a .d.ts.map', () => {
      const broken: string[] = [];

      for (const file of [...paths].filter((p) => p.endsWith('.d.ts.map'))) {
        for (const source of mapSources(file)) {
          if (!paths.has(source)) broken.push(`${file} -> ${source}`);
        }
      }

      expect(broken).toEqual([]);
    });
  });

  describe('what must not ship', () => {
    it.each([
      ['tests', /^test\//],
      ['CI configuration', /^\.github\//],
      ['maintenance scripts', /^scripts\//],
      ['the test tsconfig', /^tsconfig\.test\.json$/],
      ['jest configuration', /^jest\..*\.js$/],
      ['compiled test output', /\.(test|spec)\.(js|ts|d\.ts)$/],
    ])('excludes %s', (_label, pattern) => {
      expect([...paths].filter((p) => pattern.test(p))).toEqual([]);
    });

    it('excludes the fixture app, which would otherwise be scanned', () => {
      expect([...paths].filter((p) => p.includes('fixtures/'))).toEqual([]);
    });

    it('announces the current release line', () => {
      // 4.0.0 shipped a README headed "What's New in v3.1.0". The npm page is the
      // first thing a reader sees, it cannot be corrected without publishing again,
      // and nothing failed to warn us — the heading is prose.
      //
      // Compared on major.minor only: a patch fixes things, it does not add news,
      // so requiring an exact match would just force a pointless edit each time.
      const readme = fs.readFileSync(path.join(__dirname, '../../README.md'), 'utf-8');
      const { version } = JSON.parse(
        fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf-8'),
      );
      const heading = readme.match(/^## What's New in v(\S+)/m);
      const line = (v: string) => v.split('.').slice(0, 2).join('.');

      expect(heading).not.toBeNull();
      expect(line(heading![1])).toBe(line(version));
    });

    it('excludes demonstration material', () => {
      // Demo scripts and a sample controller were compiled into dist/ and
      // published: 89kB of code no consumer can call. They stay in the
      // repository, but the build and the tarball leave them out.
      const demo = [...paths].filter(
        (p) => p.startsWith('dist/examples/') || p.includes('DemoController'),
      );

      expect(demo).toEqual([]);
    });

    it('still ships the reference examples the README links to', () => {
      // The guard above must not take the intentional examples with it.
      expect([...paths].filter((p) => p.startsWith('examples/')).length).toBeGreaterThan(0);
    });
  });

  describe('what must ship', () => {
    it.each(['README.md', 'LICENSE', 'CHANGELOG.md'])('includes %s', (file) => {
      expect(paths.has(file)).toBe(true);
    });

    it('includes the examples referenced by the README', () => {
      expect([...paths].some((p) => p.startsWith('examples/'))).toBe(true);
    });
  });

  describe('runtime dependencies', () => {
    it('declares every non-optional package the entry point loads', () => {
      // A dependency that is imported but only listed under devDependencies
      // works locally and throws MODULE_NOT_FOUND once installed.
      const declared = new Set(Object.keys(manifest.dependencies ?? {}));
      const peers = new Set(Object.keys(manifest.peerDependencies ?? {}));
      const optional = new Set(
        Object.entries<{ optional?: boolean }>(manifest.peerDependenciesMeta ?? {})
          .filter(([, meta]) => meta.optional)
          .map(([name]) => name),
      );

      const missing = new Set<string>();

      for (const file of [...paths].filter((p) => p.startsWith('dist/') && p.endsWith('.js'))) {
        const code = fs.readFileSync(path.join(ROOT, file), 'utf-8');

        for (const match of code.matchAll(/require\("([^"]+)"\)/g)) {
          const request = match[1];
          if (request.startsWith('.') || request.startsWith('node:')) continue;

          // Scoped packages keep two segments.
          const name = request.startsWith('@')
            ? request.split('/').slice(0, 2).join('/')
            : request.split('/')[0];

          if (require('module').isBuiltin?.(name)) continue;
          if (declared.has(name) || peers.has(name) || optional.has(name)) continue;

          missing.add(`${name} (in ${file})`);
        }
      }

      expect([...missing]).toEqual([]);
    });
  });
});
