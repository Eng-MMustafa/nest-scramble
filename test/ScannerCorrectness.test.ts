/**
 * Regression tests for decorators that v3.0.6 dropped silently or guessed at.
 *
 * Each case below produced a spec that did not match the running API, which is
 * worse than missing documentation because it is confidently wrong.
 */
import { ControllerInfo, MethodInfo, ScannerService } from '../src/scanner/ScannerService';
import { OpenApiTransformer } from '../src/utils/OpenApiTransformer';
import { ScrambleLogger } from '../src/utils/ScrambleLogger';

const FIXTURE_SOURCE = 'test/fixtures/validated-app';

describe('Scanner correctness', () => {
  jest.setTimeout(120_000);

  let controllers: ControllerInfo[];
  let accounts: ControllerInfo;

  const method = (name: string): MethodInfo => {
    const found = accounts.methods.find((m) => m.name === name);
    if (!found) throw new Error(`Fixture method "${name}" not found`);
    return found;
  };

  beforeAll(() => {
    ScrambleLogger.configure('silent');
    controllers = new ScannerService().scanControllers(FIXTURE_SOURCE);
    const found = controllers.find((c) => c.name === 'AccountsController');
    if (!found) throw new Error('AccountsController fixture was not discovered');
    accounts = found;
  });

  afterAll(() => {
    ScrambleLogger.configure('info');
  });

  describe('@Controller object form', () => {
    it('reads the path from @Controller({ path })', () => {
      // Previously only the string form was handled, so this returned ''.
      expect(accounts.path).toBe('accounts');
    });

    it('reads the version from @Controller({ version })', () => {
      expect(accounts.version).toBeUndefined();
    });

    it('treats a bare @Controller() as the root path', () => {
      const root = controllers.find((c) => c.name === 'RootController');
      expect(root).toBeDefined();
      expect(root!.path).toBe('');
    });
  });

  describe('HTTP method decorators', () => {
    it('discovers @Options routes', () => {
      expect(method('preflight').httpMethod).toBe('OPTIONS');
    });

    it('discovers @Head routes', () => {
      expect(method('exists').httpMethod).toBe('HEAD');
    });

    it('discovers @All routes', () => {
      expect(method('webhook').httpMethod).toBe('ALL');
    });

    it('does not drop any endpoint from the fixture', () => {
      const names = accounts.methods.map((m) => m.name).sort();
      expect(names).toEqual(
        [
          'createAccount',
          'exists',
          'legacyLookup',
          'listAccounts',
          'preflight',
          'removeAccount',
          'webhook',
        ].sort(),
      );
    });
  });

  describe('@HttpCode', () => {
    it('reads a numeric literal', () => {
      expect(method('createAccount').httpCode).toBe(202);
    });

    it('resolves HttpStatus enum members', () => {
      expect(method('removeAccount').httpCode).toBe(204);
    });

    it('leaves httpCode undefined when the decorator is absent', () => {
      expect(method('listAccounts').httpCode).toBeUndefined();
    });
  });

  describe('method JSDoc', () => {
    it('uses the first line as the summary', () => {
      expect(method('listAccounts').summary).toBe('List every account');
    });

    it('uses the remaining body as the description', () => {
      expect(method('listAccounts').description).toContain('cursor pagination');
    });

    it('handles a single-line JSDoc without a description', () => {
      expect(method('createAccount').summary).toBe('Create a new account');
      expect(method('createAccount').description).toBeUndefined();
    });

    it('detects @deprecated', () => {
      expect(method('legacyLookup').deprecated).toBe(true);
      expect(method('listAccounts').deprecated).toBeUndefined();
    });
  });
});

describe('OpenApiTransformer correctness', () => {
  jest.setTimeout(120_000);

  let controllers: ControllerInfo[];

  beforeAll(() => {
    ScrambleLogger.configure('silent');
    controllers = new ScannerService().scanControllers(FIXTURE_SOURCE);
  });

  afterAll(() => {
    ScrambleLogger.configure('info');
  });

  describe('globalPrefix', () => {
    it('omits the prefix when none is configured', () => {
      const spec = new OpenApiTransformer('http://localhost:3000').transform(controllers);
      expect(spec.paths['/accounts']).toBeDefined();
    });

    it('prepends the configured prefix to every path', () => {
      // Without this, the documented paths do not exist on the running app.
      const spec = new OpenApiTransformer('http://localhost:3000', 'api').transform(controllers);
      expect(spec.paths['/api/accounts']).toBeDefined();
      expect(spec.paths['/api/accounts/{id}']).toBeDefined();
      expect(spec.paths['/accounts']).toBeUndefined();
    });

    it('normalises surrounding slashes in the prefix', () => {
      const spec = new OpenApiTransformer('http://localhost:3000', '/api/v1/').transform(controllers);
      expect(spec.paths['/api/v1/accounts']).toBeDefined();
    });
  });

  describe('status codes', () => {
    it('uses the @HttpCode value as the success response', () => {
      const spec = new OpenApiTransformer().transform(controllers);
      const post = spec.paths['/accounts'].post;
      expect(post.responses['202']).toBeDefined();
      // 201 was the previous hard-coded guess for POST.
      expect(post.responses['201']).toBeUndefined();
    });

    it('omits a response body for 204 No Content', () => {
      const spec = new OpenApiTransformer().transform(controllers);
      const del = spec.paths['/accounts/{id}'].delete;
      expect(del.responses['204']).toBeDefined();
      expect(del.responses['204'].content).toBeUndefined();
    });
  });

  describe('@All expansion', () => {
    it('expands to the concrete verbs OpenAPI understands', () => {
      const spec = new OpenApiTransformer().transform(controllers);
      const webhook = spec.paths['/accounts/webhook'];
      expect(webhook.get).toBeDefined();
      expect(webhook.post).toBeDefined();
      expect(webhook.put).toBeDefined();
      expect(webhook.patch).toBeDefined();
      expect(webhook.delete).toBeDefined();
      expect(webhook.all).toBeUndefined();
    });
  });

  describe('operation metadata', () => {
    it('uses the JSDoc summary instead of the raw method name', () => {
      const spec = new OpenApiTransformer().transform(controllers);
      expect(spec.paths['/accounts'].get.summary).toBe('List every account');
    });

    it('falls back to the method name when there is no JSDoc', () => {
      const spec = new OpenApiTransformer().transform(controllers);
      expect(spec.paths['/accounts/preflight'].options.summary).toBe('preflight');
    });

    it('emits a stable operationId', () => {
      const spec = new OpenApiTransformer().transform(controllers);
      expect(spec.paths['/accounts'].get.operationId).toBe('AccountsController_listAccounts');
    });

    it('marks deprecated operations', () => {
      const spec = new OpenApiTransformer().transform(controllers);
      expect(spec.paths['/accounts/legacy/{id}'].get.deprecated).toBe(true);
      expect(spec.paths['/accounts'].get.deprecated).toBeUndefined();
    });
  });
});
