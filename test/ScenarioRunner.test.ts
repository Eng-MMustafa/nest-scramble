/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import {
  containsSubset,
  extractPath,
  fillVars,
  formatScenarioResult,
  runScenario,
  Scenario,
} from '../src/runner/ScenarioRunner';

/** In-memory fetch: maps `METHOD url` to a canned response. */
function fakeFetch(routes: Record<string, { status: number; body?: unknown }>) {
  const calls: Array<{ url: string; init: any }> = [];
  const impl = async (url: string, init: any) => {
    calls.push({ url, init });
    const route = routes[`${init.method} ${url}`];
    if (!route) return { status: 404, text: async () => JSON.stringify({ error: 'not found' }) };
    return { status: route.status, text: async () => JSON.stringify(route.body ?? {}) };
  };
  return { impl, calls };
}

describe('fillVars', () => {
  it('replaces {{placeholders}} and leaves unknowns intact', () => {
    expect(fillVars('/users/{{id}}?q={{missing}}', { id: '7' })).toBe('/users/7?q={{missing}}');
  });
});

describe('extractPath', () => {
  const payload = { token: 'abc', user: { roles: ['admin', 'dev'] }, items: [{ id: 5 }] };

  it('extracts dotted paths', () => {
    expect(extractPath(payload, '$.token')).toBe('abc');
    expect(extractPath(payload, '$.user.roles[1]')).toBe('dev');
    expect(extractPath(payload, '$.items[0].id')).toBe(5);
  });

  it('returns undefined for missing paths', () => {
    expect(extractPath(payload, '$.nope.deep')).toBeUndefined();
  });

  it('returns the payload for $', () => {
    expect(extractPath(payload, '$')).toBe(payload);
  });
});

describe('containsSubset', () => {
  it('passes when the subset matches', () => {
    expect(containsSubset({ a: 1, b: { c: 'x', d: 2 } }, { b: { c: 'x' } })).toHaveLength(0);
  });

  it('reports the exact mismatching field', () => {
    const failures = containsSubset({ a: 1 }, { a: 2 });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('a: expected 2');
  });

  it('reports missing fields', () => {
    expect(containsSubset({}, { role: 'admin' })[0]).toContain('role');
  });
});

describe('runScenario', () => {
  const loginScenario: Scenario = {
    name: 'Auth flow',
    baseUrl: 'http://api.test',
    vars: { email: 'a@b.c' },
    steps: [
      {
        name: 'login',
        request: {
          method: 'POST',
          path: '/auth/login',
          body: { email: '{{email}}', password: 'x' },
        },
        expect: { status: 201, bodyContains: { tokenType: 'Bearer' } },
        capture: { token: '$.accessToken' },
      },
      {
        name: 'me',
        request: {
          method: 'GET',
          path: '/users/1',
          headers: { Authorization: 'Bearer {{token}}' },
        },
        expect: { status: 200 },
      },
    ],
  };

  it('chains variables between steps', async () => {
    const { impl, calls } = fakeFetch({
      'POST http://api.test/auth/login': {
        status: 201,
        body: { accessToken: 'jwt-123', tokenType: 'Bearer' },
      },
      'GET http://api.test/users/1': { status: 200, body: { id: 1 } },
    });

    const result = await runScenario(loginScenario, { fetchImpl: impl });

    expect(result.passed).toBe(true);
    expect(result.steps).toHaveLength(2);
    expect(calls[1].init.headers.Authorization).toBe('Bearer jwt-123');
    expect(JSON.parse(calls[0].init.body).email).toBe('a@b.c');
  });

  it('fails on unexpected status with a clear message', async () => {
    const { impl } = fakeFetch({
      'POST http://api.test/auth/login': { status: 401, body: { error: 'nope' } },
      'GET http://api.test/users/1': { status: 200, body: {} },
    });

    const result = await runScenario(loginScenario, { fetchImpl: impl });

    expect(result.passed).toBe(false);
    expect(result.steps[0].failures[0]).toContain('expected 201, got 401');
  });

  it('fails on body mismatches', async () => {
    const { impl } = fakeFetch({
      'POST http://api.test/auth/login': {
        status: 201,
        body: { accessToken: 't', tokenType: 'Basic' },
      },
      'GET http://api.test/users/1': { status: 200, body: {} },
    });

    const result = await runScenario(loginScenario, { fetchImpl: impl });

    expect(result.steps[0].failures.join(' ')).toContain('tokenType');
  });

  it('validates responses against the OpenAPI spec with matchesSpec', async () => {
    const spec = {
      paths: {
        '/users/{id}': {
          get: {
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      required: ['id', 'name'],
                      properties: { id: { type: 'integer' }, name: { type: 'string' } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    const scenario: Scenario = {
      name: 'Contract',
      baseUrl: 'http://api.test',
      steps: [
        {
          name: 'get user',
          request: { method: 'GET', path: '/users/1' },
          expect: { status: 200, matchesSpec: true },
        },
      ],
    };

    const { impl } = fakeFetch({
      'GET http://api.test/users/1': { status: 200, body: { id: 1, secret: 'x' } },
    });

    const result = await runScenario(scenario, { fetchImpl: impl, spec });

    expect(result.passed).toBe(false);
    const text = result.steps[0].failures.join('\n');
    expect(text).toContain('missing-field');
    expect(text).toContain('unexpected-field');
  });

  it('defaults to accepting any 2xx status', async () => {
    const scenario: Scenario = {
      name: 'Default status',
      baseUrl: 'http://api.test',
      steps: [{ name: 'ping', request: { method: 'GET', path: '/ping' } }],
    };
    const { impl } = fakeFetch({ 'GET http://api.test/ping': { status: 204 } });

    const result = await runScenario(scenario, { fetchImpl: impl });
    expect(result.passed).toBe(true);
  });

  it('reports capture misses', async () => {
    const scenario: Scenario = {
      name: 'Capture miss',
      baseUrl: 'http://api.test',
      steps: [
        {
          name: 'login',
          request: { method: 'POST', path: '/auth/login' },
          capture: { token: '$.does.not.exist' },
        },
      ],
    };
    const { impl } = fakeFetch({
      'POST http://api.test/auth/login': { status: 200, body: { ok: true } },
    });

    const result = await runScenario(scenario, { fetchImpl: impl });
    expect(result.passed).toBe(false);
    expect(result.steps[0].failures[0]).toContain('did not match');
  });

  it('renders a readable report', async () => {
    const { impl } = fakeFetch({
      'POST http://api.test/auth/login': {
        status: 201,
        body: { accessToken: 'jwt', tokenType: 'Bearer' },
      },
      'GET http://api.test/users/1': { status: 200, body: {} },
    });

    const result = await runScenario(loginScenario, { fetchImpl: impl });
    const text = formatScenarioResult(result);

    expect(text).toContain('✅ Auth flow');
    expect(text).toContain('✓ login');
    expect(text).toContain('✓ me');
  });
});
