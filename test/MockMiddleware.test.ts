/**
 * Regression tests for the mock middleware.
 *
 * Every case here produced a wrong response before: the mock either answered
 * with another endpoint's payload, ignored the endpoint entirely, or replied
 * with a protocol-invalid body.
 */
import { MOCK_GLOBAL_PREFIX, MockMiddleware } from '../src/middleware/MockMiddleware';
import { ControllerInfo, MethodInfo } from '../src/scanner/ScannerService';
import { AnalyzedType } from '../src/utils/DtoAnalyzer';

const stringType: AnalyzedType = { type: 'string', isArray: false, isOptional: false };

/**
 * Builds a response type whose *property name* identifies the route.
 *
 * The generated values come from faker and are therefore useless as an
 * identifier; property names are copied verbatim, so they are deterministic.
 */
const objectType = (marker: string): AnalyzedType => ({
  type: marker,
  isArray: false,
  isOptional: false,
  properties: [{ name: `marker_${marker}`, type: stringType }],
});

/** Reads back which route produced a response. */
const markerOf = (body: unknown): string | undefined => {
  const key = Object.keys(body as Record<string, unknown>).find(k => k.startsWith('marker_'));
  return key?.slice('marker_'.length);
};

const method = (overrides: Partial<MethodInfo> & Pick<MethodInfo, 'name' | 'httpMethod' | 'route'>): MethodInfo => ({
  parameters: [],
  returnType: stringType,
  ...overrides,
});

const controller = (path: string, methods: MethodInfo[], extra: Partial<ControllerInfo> = {}): ControllerInfo => ({
  name: `${path || 'Root'}Controller`,
  path,
  methods,
  ...extra,
});

interface FakeResponse {
  statusCode?: number;
  body?: unknown;
  headers: Record<string, string>;
  ended: boolean;
}

/**
 * Stands in for a raw Node `ServerResponse`.
 *
 * The middleware deliberately avoids `res.status().json()`: that is an Express
 * convenience which does not exist on the response Fastify hands to middleware.
 * This double therefore exposes only the Node core surface, so a regression back
 * to Express-only APIs fails here rather than at runtime on Fastify.
 */
function invoke(
  controllers: ControllerInfo[],
  req: { path?: string; url?: string; method: string },
  globalPrefix?: string,
) {
  const middleware = new MockMiddleware(controllers, globalPrefix);
  const res: FakeResponse = { headers: {}, ended: false };
  let nextCalled = false;

  const resApi = {
    set statusCode(code: number) {
      res.statusCode = code;
    },
    get statusCode() {
      return res.statusCode ?? 200;
    },
    setHeader(name: string, value: string) {
      res.headers[name.toLowerCase()] = value;
    },
    end(payload?: string) {
      res.ended = true;
      if (typeof payload === 'string') {
        res.body = JSON.parse(payload);
      }
    },
  };

  middleware.use(req, resApi, () => {
    nextCalled = true;
  });

  return { res, nextCalled };
}

describe('MockMiddleware', () => {
  describe('pass-through', () => {
    it('ignores paths outside the mock prefix', () => {
      const { nextCalled, res } = invoke([controller('users', [method({ name: 'list', httpMethod: 'GET', route: '' })])], {
        path: '/users',
        method: 'GET',
      });

      expect(nextCalled).toBe(true);
      expect(res.statusCode).toBeUndefined();
    });

    it('does not treat a lookalike prefix as a mock request', () => {
      const { nextCalled } = invoke([], { path: '/scramble-mockery/users', method: 'GET' });
      expect(nextCalled).toBe(true);
    });

    it('returns 404 for an unknown mock route', () => {
      const { res } = invoke([], { path: '/scramble-mock/nope', method: 'GET' });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('adapter independence', () => {
    const users = [controller('users', [method({ name: 'list', httpMethod: 'GET', route: '' })])];

    it('reads the path from `url` when `path` is absent', () => {
      // Fastify middleware receives the raw Node request, which has no `path`.
      const { res } = invoke(users, { url: '/scramble-mock/users', method: 'GET' });
      expect(res.statusCode).toBe(200);
    });

    it('strips the query string from `url`', () => {
      const { res } = invoke(users, { url: '/scramble-mock/users?page=2&sort=name', method: 'GET' });
      expect(res.statusCode).toBe(200);
    });

    it('passes through on `url` outside the prefix', () => {
      const { nextCalled } = invoke(users, { url: '/users?page=2', method: 'GET' });
      expect(nextCalled).toBe(true);
    });

    it('sets a JSON content type', () => {
      const { res } = invoke(users, { url: '/scramble-mock/users', method: 'GET' });
      expect(res.headers['content-type']).toContain('application/json');
    });

    it('tolerates a request carrying neither path nor url', () => {
      const { nextCalled } = invoke(users, { method: 'GET' });
      expect(nextCalled).toBe(true);
    });
  });

  describe('route precedence', () => {
    // The previous implementation returned the first route in scan order, so a
    // `:id` route declared first swallowed every sibling literal route.
    const users = controller('users', [
      method({ name: 'findOne', httpMethod: 'GET', route: ':id', returnType: objectType('ById') }),
      method({ name: 'me', httpMethod: 'GET', route: 'me', returnType: objectType('Me') }),
    ]);

    it('prefers a literal segment over a path parameter', () => {
      const { res } = invoke([users], { path: '/scramble-mock/users/me', method: 'GET' });
      expect(markerOf(res.body)).toBe('Me');
    });

    it('still matches the parameter route for other values', () => {
      const { res } = invoke([users], { path: '/scramble-mock/users/42', method: 'GET' });
      expect(markerOf(res.body)).toBe('ById');
    });

    it('is independent of declaration order', () => {
      const reversed = controller('users', [...users.methods].reverse());
      const { res } = invoke([reversed], { path: '/scramble-mock/users/me', method: 'GET' });
      expect(markerOf(res.body)).toBe('Me');
    });

    it('prefers the literal at a deeper position too', () => {
      const nested = controller('orgs', [
        method({ name: 'anyTeam', httpMethod: 'GET', route: ':org/teams/:team', returnType: objectType('AnyTeam') }),
        method({ name: 'ownTeam', httpMethod: 'GET', route: ':org/teams/own', returnType: objectType('OwnTeam') }),
      ]);

      const { res } = invoke([nested], { path: '/scramble-mock/orgs/acme/teams/own', method: 'GET' });
      expect(markerOf(res.body)).toBe('OwnTeam');
    });
  });

  describe('verb matching', () => {
    it('does not match a different verb on the same path', () => {
      const { res } = invoke([controller('users', [method({ name: 'list', httpMethod: 'GET', route: '' })])], {
        path: '/scramble-mock/users',
        method: 'DELETE',
      });

      expect(res.statusCode).toBe(404);
    });

    it('answers every verb for an @All route', () => {
      // 'ALL' never equalled req.method, so @All routes were unreachable.
      const all = controller('hooks', [
        method({ name: 'any', httpMethod: 'ALL', route: '', returnType: objectType('Any') }),
      ]);

      for (const verb of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
        const { res } = invoke([all], { path: '/scramble-mock/hooks', method: verb });
        expect(markerOf(res.body)).toBe('Any');
      }
    });

    it('matches the verb case-insensitively', () => {
      const { res } = invoke([controller('users', [method({ name: 'list', httpMethod: 'GET', route: '' })])], {
        path: '/scramble-mock/users',
        method: 'get',
      });

      expect(res.statusCode).toBe(200);
    });
  });

  describe('status codes', () => {
    it('defaults to 200', () => {
      const { res } = invoke([controller('users', [method({ name: 'list', httpMethod: 'GET', route: '' })])], {
        path: '/scramble-mock/users',
        method: 'GET',
      });

      expect(res.statusCode).toBe(200);
    });

    it('defaults to 201 for POST', () => {
      const { res } = invoke([controller('users', [method({ name: 'create', httpMethod: 'POST', route: '' })])], {
        path: '/scramble-mock/users',
        method: 'POST',
      });

      expect(res.statusCode).toBe(201);
    });

    it('honours @HttpCode over the verb convention', () => {
      const { res } = invoke(
        [controller('users', [method({ name: 'create', httpMethod: 'POST', route: '', httpCode: 202 })])],
        { path: '/scramble-mock/users', method: 'POST' },
      );

      expect(res.statusCode).toBe(202);
    });

    it('returns 200 for DELETE, matching NestJS', () => {
      // The old default of 204 for DELETE did not match NestJS behaviour.
      const { res } = invoke(
        [controller('users', [method({ name: 'remove', httpMethod: 'DELETE', route: ':id' })])],
        { path: '/scramble-mock/users/7', method: 'DELETE' },
      );

      expect(res.statusCode).toBe(200);
    });

    it('sends no body with a 204', () => {
      // Previously a JSON body was sent alongside 204, which is invalid.
      const { res } = invoke(
        [controller('users', [method({ name: 'remove', httpMethod: 'DELETE', route: ':id', httpCode: 204 })])],
        { path: '/scramble-mock/users/7', method: 'DELETE' },
      );

      expect(res.statusCode).toBe(204);
      expect(res.ended).toBe(true);
      expect(res.body).toBeUndefined();
    });
  });

  describe('path construction parity with the generated document', () => {
    it('answers on the versioned path', () => {
      // The transformer emits /v2/accounts; the mock used to expect /accounts.
      const versioned = controller('accounts', [method({ name: 'list', httpMethod: 'GET', route: '' })], {
        version: '2',
      });

      const { res } = invoke([versioned], { path: '/scramble-mock/v2/accounts', method: 'GET' });
      expect(res.statusCode).toBe(200);
    });

    it('answers on the prefixed path', () => {
      const { res } = invoke(
        [controller('accounts', [method({ name: 'list', httpMethod: 'GET', route: '' })])],
        { path: '/scramble-mock/api/accounts', method: 'GET' },
        'api',
      );

      expect(res.statusCode).toBe(200);
    });

    it('does not answer on the unprefixed path when a prefix is configured', () => {
      const { res } = invoke(
        [controller('accounts', [method({ name: 'list', httpMethod: 'GET', route: '' })])],
        { path: '/scramble-mock/accounts', method: 'GET' },
        'api',
      );

      expect(res.statusCode).toBe(404);
    });

    it('handles nested method routes', () => {
      const { res } = invoke(
        [controller('accounts', [method({ name: 'legacy', httpMethod: 'GET', route: 'legacy/:id' })])],
        { path: '/scramble-mock/accounts/legacy/9', method: 'GET' },
      );

      expect(res.statusCode).toBe(200);
    });

    it('does not match when segment counts differ', () => {
      const { res } = invoke(
        [controller('accounts', [method({ name: 'findOne', httpMethod: 'GET', route: ':id' })])],
        { path: '/scramble-mock/accounts/9/extra', method: 'GET' },
      );

      expect(res.statusCode).toBe(404);
    });
  });
});

describe('MOCK_GLOBAL_PREFIX token', () => {
  it('is optional so the middleware works without it', () => {
    expect(() => new MockMiddleware([])).not.toThrow();
    expect(MOCK_GLOBAL_PREFIX).toBeTruthy();
  });
});
