/**
 * Structural invariant: enabling `useIncrementalScanning` must not change what
 * the library sees.
 *
 * `IncrementalScannerService` used to carry a verbatim copy of the extraction
 * logic, frozen at an older revision. Turning the flag on silently downgraded
 * the documentation: no `@HttpCode`, no JSDoc summaries, no `@All`/`@Options`/
 * `@Head` verbs, and no object-form `@Controller({ path })`. The same source
 * produced two different specs depending on a performance flag.
 *
 * These tests assert the equivalence directly rather than re-listing features,
 * so any future divergence fails immediately.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { IncrementalScannerService } from '../src/scanner/IncrementalScannerService';
import { ControllerInfo, ScannerService } from '../src/scanner/ScannerService';
import { OpenApiTransformer } from '../src/utils/OpenApiTransformer';
import { ScrambleLogger } from '../src/utils/ScrambleLogger';

const FIXTURE_SOURCE = 'test/fixtures/validated-app';

/** Drops the incremental-only bookkeeping field before comparing. */
function normalize(controllers: ControllerInfo[]) {
  return [...controllers]
    .map(({ ...controller }) => {
      delete (controller as Record<string, unknown>).filePath;
      return controller;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

describe('scanner parity', () => {
  jest.setTimeout(180_000);

  let cacheFile: string;
  let plain: ControllerInfo[];
  let incremental: ControllerInfo[];

  beforeAll(() => {
    ScrambleLogger.configure('silent');

    cacheFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'scramble-parity-')), 'cache.json');

    plain = new ScannerService().scanControllers(FIXTURE_SOURCE);

    const service = new IncrementalScannerService({ cacheFilePath: cacheFile, useCache: false });
    service.initialize(FIXTURE_SOURCE);
    incremental = service.scanControllers(FIXTURE_SOURCE);
    service.cleanup();
  });

  afterAll(() => {
    ScrambleLogger.configure('info');
    fs.rmSync(path.dirname(cacheFile), { recursive: true, force: true });
  });

  it('discovers the same controllers', () => {
    expect(incremental.map(c => c.name).sort()).toEqual(plain.map(c => c.name).sort());
  });

  it('produces byte-identical controller metadata', () => {
    expect(normalize(incremental)).toEqual(normalize(plain));
  });

  it('carries @HttpCode through the incremental path', () => {
    const accounts = incremental.find(c => c.name === 'AccountsController')!;
    expect(accounts.methods.find(m => m.name === 'createAccount')?.httpCode).toBe(202);
  });

  it('carries JSDoc summaries through the incremental path', () => {
    const accounts = incremental.find(c => c.name === 'AccountsController')!;
    expect(accounts.methods.find(m => m.name === 'listAccounts')?.summary).toBe('List every account');
  });

  it('discovers @All/@Options/@Head through the incremental path', () => {
    const accounts = incremental.find(c => c.name === 'AccountsController')!;
    const verbs = accounts.methods.map(m => m.httpMethod);
    expect(verbs).toContain('ALL');
    expect(verbs).toContain('OPTIONS');
    expect(verbs).toContain('HEAD');
  });

  it('reads object-form @Controller through the incremental path', () => {
    const accounts = incremental.find(c => c.name === 'AccountsController')!;
    expect(accounts.path).toBe('accounts');
  });

  it('carries class-validator constraints through the incremental path', () => {
    const accounts = incremental.find(c => c.name === 'AccountsController')!;
    const body = accounts.methods
      .find(m => m.name === 'createAccount')!
      .parameters.find(p => p.parameterLocation === 'body')!;

    const email = body.type.properties!.find(p => p.name === 'email')!;
    expect(email.validation?.format).toBe('email');
  });

  it('generates an identical OpenAPI document from either scanner', () => {
    const fromPlain = new OpenApiTransformer('http://localhost:3000').transform(plain);
    const fromIncremental = new OpenApiTransformer('http://localhost:3000').transform(incremental);

    expect(Object.keys(fromIncremental.paths).sort()).toEqual(Object.keys(fromPlain.paths).sort());
    expect(fromIncremental.paths).toEqual(fromPlain.paths);
  });
});
