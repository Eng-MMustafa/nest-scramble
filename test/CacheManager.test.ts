/**
 * Tests for the cache layer, which had no coverage at all despite being
 * user-facing through `useIncrementalScanning: true`.
 *
 * The most important case here is version invalidation: the cache version was a
 * hand-maintained constant unrelated to the library version, so upgrading
 * nest-scramble silently reused entries produced by the older analyser. Every
 * newly supported decorator was missing until the user deleted the file by hand.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CacheManager, CachedController } from '../src/cache/CacheManager';
import { ControllerInfo } from '../src/scanner/ScannerService';

const LIBRARY_VERSION: string = require('../package.json').version;

function tempCacheFile(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'scramble-cache-')), 'cache.json');
}

const controller = (name: string): ControllerInfo => ({
  name,
  path: name.toLowerCase(),
  methods: [],
});

const entry = (filePath: string, names: string[]): CachedController => ({
  filePath,
  fileHash: 'hash',
  fileSize: 10,
  controllerInfos: names.map(controller),
  dependencies: [],
  lastScanned: Date.now(),
});

describe('CacheManager', () => {
  let cacheFile: string;

  beforeEach(() => {
    cacheFile = tempCacheFile();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(path.dirname(cacheFile), { recursive: true, force: true });
  });

  describe('version invalidation', () => {
    it('stamps the cache with the installed library version', () => {
      const manager = new CacheManager({ cacheFilePath: cacheFile });
      manager.setController('a.ts', entry('a.ts', ['A']));
      manager.save();

      const raw = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      expect(raw.version).toBe(LIBRARY_VERSION);
    });

    it('rejects a cache written by a different library version', () => {
      const manager = new CacheManager({ cacheFilePath: cacheFile });
      manager.setController('a.ts', entry('a.ts', ['A']));
      manager.save();

      // Simulate the file left behind by an older install.
      const raw = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      raw.version = '0.0.1-old';
      fs.writeFileSync(cacheFile, JSON.stringify(raw));

      const reloaded = new CacheManager({ cacheFilePath: cacheFile });
      expect(reloaded.load()).toBe(false);
      expect(reloaded.getController('a.ts')).toBeUndefined();
    });

    it('accepts a cache written by the same version', () => {
      const manager = new CacheManager({ cacheFilePath: cacheFile });
      manager.setController('a.ts', entry('a.ts', ['A']));
      manager.save();

      const reloaded = new CacheManager({ cacheFilePath: cacheFile });
      expect(reloaded.load()).toBe(true);
      expect(reloaded.getController('a.ts')).toBeDefined();
    });
  });

  describe('multiple controllers per file', () => {
    it('round-trips every controller declared in one file', () => {
      // Only the first was retained before, so the rest vanished from the docs.
      const manager = new CacheManager({ cacheFilePath: cacheFile });
      manager.setController('multi.ts', entry('multi.ts', ['First', 'Second', 'Third']));
      manager.save();

      const reloaded = new CacheManager({ cacheFilePath: cacheFile });
      reloaded.load();

      const names = reloaded.getController('multi.ts')?.controllerInfos.map(c => c.name);
      expect(names).toEqual(['First', 'Second', 'Third']);
    });
  });

  describe('persistence', () => {
    it('reports no cache when the file does not exist', () => {
      const manager = new CacheManager({ cacheFilePath: cacheFile });
      expect(manager.load()).toBe(false);
    });

    it('does not load when disabled', () => {
      const manager = new CacheManager({ cacheFilePath: cacheFile, enabled: false });
      manager.setController('a.ts', entry('a.ts', ['A']));
      manager.save();

      expect(fs.existsSync(cacheFile)).toBe(false);
      expect(manager.load()).toBe(false);
    });

    it('survives a corrupt cache file without throwing', () => {
      fs.writeFileSync(cacheFile, '{ not json');
      const manager = new CacheManager({ cacheFilePath: cacheFile });
      expect(() => manager.load()).not.toThrow();
      expect(manager.load()).toBe(false);
    });

    it('removes an entry', () => {
      const manager = new CacheManager({ cacheFilePath: cacheFile });
      manager.setController('a.ts', entry('a.ts', ['A']));
      manager.removeController('a.ts');
      expect(manager.getController('a.ts')).toBeUndefined();
    });
  });

  describe('change detection', () => {
    /**
     * Detection compares the hash *and* the on-disk size, so these cases need a
     * real file rather than a synthetic path.
     */
    let sourceFile: string;

    beforeEach(() => {
      sourceFile = path.join(path.dirname(cacheFile), 'a.ts');
      fs.writeFileSync(sourceFile, 'export class A {}');
    });

    const cachedEntry = (manager: CacheManager) => {
      const record = entry(sourceFile, ['A']);
      record.fileHash = manager.calculateHash(sourceFile);
      record.fileSize = fs.statSync(sourceFile).size;
      manager.setController(sourceFile, record);
      return record;
    };

    it('reports a file as changed when the hash differs', () => {
      const manager = new CacheManager({ cacheFilePath: cacheFile });
      cachedEntry(manager);
      expect(manager.hasFileChanged(sourceFile, 'different-hash')).toBe(true);
    });

    it('reports a file as unchanged when the hash and size match', () => {
      const manager = new CacheManager({ cacheFilePath: cacheFile });
      const record = cachedEntry(manager);
      expect(manager.hasFileChanged(sourceFile, record.fileHash)).toBe(false);
    });

    it('treats a matching hash with a different size as changed', () => {
      // Guards against a hash collision silently serving stale metadata.
      const manager = new CacheManager({ cacheFilePath: cacheFile });
      const record = cachedEntry(manager);
      fs.writeFileSync(sourceFile, 'export class A { extra = 1; }');

      expect(manager.hasFileChanged(sourceFile, record.fileHash)).toBe(true);
    });

    it('treats a deleted file as changed', () => {
      const manager = new CacheManager({ cacheFilePath: cacheFile });
      const record = cachedEntry(manager);
      fs.rmSync(sourceFile);

      expect(manager.hasFileChanged(sourceFile, record.fileHash)).toBe(true);
    });

    it('treats an unknown file as changed', () => {
      const manager = new CacheManager({ cacheFilePath: cacheFile });
      expect(manager.hasFileChanged('missing.ts', 'hash')).toBe(true);
    });
  });
});
