/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import { checkDrift, compareWithSchema, matchSpecPath } from '../src/drift/DriftDetector';

const spec = {
  paths: {
    '/users': {
      get: {
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/User' } },
              },
            },
          },
        },
      },
    },
    '/users/{id}': {
      get: {
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/User' },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      User: {
        type: 'object',
        required: ['id', 'name'],
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
        },
      },
    },
  },
};

describe('matchSpecPath', () => {
  it('matches exact paths', () => {
    expect(matchSpecPath(spec, '/users')).toBe('/users');
  });

  it('matches parameterised paths', () => {
    expect(matchSpecPath(spec, '/users/42')).toBe('/users/{id}');
  });

  it('prefers the more specific route', () => {
    expect(matchSpecPath(spec, '/users')).toBe('/users');
  });

  it('returns null for unknown routes', () => {
    expect(matchSpecPath(spec, '/orders')).toBeNull();
  });
});

describe('compareWithSchema', () => {
  const userSchema = { $ref: '#/components/schemas/User' };

  it('accepts a conforming payload', () => {
    const issues = compareWithSchema({ id: 1, name: 'Ada', email: 'a@b.c' }, userSchema, spec);
    expect(issues).toHaveLength(0);
  });

  it('flags fields returned but not documented', () => {
    const issues = compareWithSchema({ id: 1, name: 'Ada', password: 'x' }, userSchema, spec);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe('unexpected-field');
    expect(issues[0].location).toBe('password');
  });

  it('flags required fields the API did not return', () => {
    const issues = compareWithSchema({ id: 1 }, userSchema, spec);
    expect(issues.map(i => i.kind)).toContain('missing-field');
    expect(issues.find(i => i.kind === 'missing-field')!.location).toBe('name');
  });

  it('flags type mismatches with the exact location', () => {
    const issues = compareWithSchema({ id: 'one', name: 'Ada' }, userSchema, spec);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe('type-mismatch');
    expect(issues[0].location).toBe('id');
  });

  it('accepts integers where number is documented', () => {
    const issues = compareWithSchema(3, { type: 'number' }, spec);
    expect(issues).toHaveLength(0);
  });

  it('checks the first element of arrays', () => {
    const issues = compareWithSchema(
      [{ id: 1, name: 'Ada', extra: true }],
      { type: 'array', items: userSchema },
      spec,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].location).toBe('[].extra');
  });

  it('is lenient about free-form objects', () => {
    const issues = compareWithSchema({ anything: 1 }, { type: 'object' }, spec);
    expect(issues).toHaveLength(0);
  });

  it('ignores null and undefined payloads', () => {
    expect(compareWithSchema(null, { type: 'object' }, spec)).toHaveLength(0);
    expect(compareWithSchema(undefined, { type: 'string' }, spec)).toHaveLength(0);
  });
});

describe('checkDrift', () => {
  it('reports undocumented routes', () => {
    const issues = checkDrift(spec, 'GET', '/orders', 200, {});
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe('undocumented-route');
  });

  it('reports undocumented success statuses', () => {
    const issues = checkDrift(spec, 'GET', '/users', 206, []);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe('undocumented-status');
  });

  it('does not flag undocumented error statuses', () => {
    const issues = checkDrift(spec, 'GET', '/users', 429, { error: 'rate limited' });
    expect(issues).toHaveLength(0);
  });

  it('validates the body against the documented schema', () => {
    const issues = checkDrift(spec, 'GET', '/users/1', 200, { id: 1, name: 'Ada', secret: 'x' });
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe('unexpected-field');
  });

  it('passes clean responses', () => {
    const issues = checkDrift(spec, 'GET', '/users/1', 200, { id: 1, name: 'Ada' });
    expect(issues).toHaveLength(0);
  });
});
