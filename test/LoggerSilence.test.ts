/**
 * Verifies that `logLevel: 'silent'` really is silent.
 *
 * The option was documented as silencing library output, but the incremental
 * scanner, cache manager, dependency tracker and watcher all wrote straight to
 * `console`, bypassing the logger entirely. Anyone enabling
 * `useIncrementalScanning` still got dozens of lines per boot with no way to
 * turn them off.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CacheManager } from '../src/cache/CacheManager';
import { IncrementalScannerService } from '../src/scanner/IncrementalScannerService';
import { ScannerService } from '../src/scanner/ScannerService';
import { ScrambleLogger } from '../src/utils/ScrambleLogger';

const FIXTURE_SOURCE = 'test/fixtures/validated-app';

/**
 * Captures everything the library writes during `fn`.
 *
 * Both channels must be intercepted: the NestJS `Logger` writes straight to
 * `process.stdout`/`process.stderr`, so watching `console` alone would report
 * silence that is not real.
 */
function captureOutput(fn: () => void): string[] {
  const captured: string[] = [];
  const record = (...args: unknown[]) => {
    captured.push(args.map(String).join(' '));
  };

  const consoleSpies = [
    jest.spyOn(console, 'log').mockImplementation(record),
    jest.spyOn(console, 'warn').mockImplementation(record),
    jest.spyOn(console, 'error').mockImplementation(record),
    jest.spyOn(console, 'debug').mockImplementation(record),
  ];

  const streamSpies = [process.stdout, process.stderr].map(stream =>
    jest.spyOn(stream, 'write').mockImplementation((chunk: any) => {
      captured.push(String(chunk));
      return true;
    }),
  );

  try {
    fn();
  } finally {
    [...consoleSpies, ...streamSpies].forEach(spy => spy.mockRestore());
  }

  return captured;
}

describe('logLevel: silent', () => {
  jest.setTimeout(180_000);

  let workDir: string;

  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scramble-silence-'));
  });

  afterEach(() => {
    ScrambleLogger.configure('info');
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  it('silences the plain scanner', () => {
    ScrambleLogger.configure('silent');

    const output = captureOutput(() => {
      new ScannerService().scanControllers(FIXTURE_SOURCE);
    });

    expect(output).toEqual([]);
  });

  it('silences the incremental scanner', () => {
    ScrambleLogger.configure('silent');

    const output = captureOutput(() => {
      const service = new IncrementalScannerService({
        cacheFilePath: path.join(workDir, 'cache.json'),
      });
      service.initialize(FIXTURE_SOURCE);
      service.scanControllers(FIXTURE_SOURCE);
      service.cleanup();
    });

    expect(output).toEqual([]);
  });

  it('silences the cache manager', () => {
    ScrambleLogger.configure('silent');

    const output = captureOutput(() => {
      const manager = new CacheManager({ cacheFilePath: path.join(workDir, 'cache.json') });
      manager.load();
      manager.save();
    });

    expect(output).toEqual([]);
  });

  it('still reports errors at the default level', () => {
    ScrambleLogger.configure('info');

    const corrupt = path.join(workDir, 'corrupt.json');
    fs.writeFileSync(corrupt, '{ not json');

    const output = captureOutput(() => {
      new CacheManager({ cacheFilePath: corrupt }).load();
    });

    // Silence must be opt-in: real failures are still surfaced by default.
    expect(output.length).toBeGreaterThan(0);
  });

  it('keeps errors visible at logLevel error', () => {
    ScrambleLogger.configure('error');

    const corrupt = path.join(workDir, 'corrupt.json');
    fs.writeFileSync(corrupt, '{ not json');

    const output = captureOutput(() => {
      new CacheManager({ cacheFilePath: corrupt }).load();
    });

    expect(output.length).toBeGreaterThan(0);
  });

  it('suppresses errors only at logLevel silent', () => {
    ScrambleLogger.configure('silent');

    const corrupt = path.join(workDir, 'corrupt.json');
    fs.writeFileSync(corrupt, '{ not json');

    const output = captureOutput(() => {
      new CacheManager({ cacheFilePath: corrupt }).load();
    });

    expect(output).toEqual([]);
  });
});
