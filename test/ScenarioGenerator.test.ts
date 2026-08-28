/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import {
  exampleFromSchema,
  generateScenarios,
  scenarioFileName,
} from '../src/runner/ScenarioGenerator';
import { runScenario } from '../src/runner/ScenarioRunner';

/** A small spec shaped like the real transformer output. */
const spec = {
  openapi: '3.0.0',
  servers: [{ url: 'http://localhost:3000' }],
  components: {
    schemas: {
      User: {
        type: 'object',
        required: ['id', 'name', 'email'],
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
        },
      },
      CreateUserDto: {
        type: 'object',
        required: ['name', 'email'],
        properties: {
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
        },
      },
      LoginResponse: {
        type: 'object',
        properties: {
          accessToken: { type: 'string' },
          tokenType: { type: 'string' },
        },
      },
    },
  },
  paths: {
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register',
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateUserDto' } } },
        },
        responses: {
          '201': {
            content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } },
          },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Log in',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { email: { type: 'string' }, password: { type: 'string' } },
              },
            },
          },
        },
        responses: {
          '201': {
            content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginResponse' } } },
          },
        },
      },
    },
    '/users': {
      get: {
        tags: ['Users'],
        summary: 'List users',
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
      post: {
        tags: ['Users'],
        summary: 'Create a user',
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateUserDto' } } },
        },
        responses: {
          '201': {
            content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } },
          },
        },
      },
    },
    '/users/{id}': {
      get: {
        tags: ['Users'],
        summary: 'Get one user',
        responses: {
          '200': {
            content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } },
          },
        },
      },
      delete: {
        tags: ['Users'],
        summary: 'Delete a user',
        responses: { '204': { description: 'gone' } },
      },
    },
  },
};

describe('exampleFromSchema', () => {
  it('resolves $refs and generates deterministic values', () => {
    const example = exampleFromSchema({ $ref: '#/components/schemas/CreateUserDto' }, spec) as any;
    expect(example.email).toBe('user@example.com');
    expect(example.password).toBe('SecurePassword123!');
    expect(example.name).toBe('Example Name');
  });

  it('uses formats, enums and minimums', () => {
    expect(exampleFromSchema({ type: 'string', format: 'uuid' }, spec)).toContain('0000');
    expect(exampleFromSchema({ type: 'string', enum: ['a', 'b'] }, spec)).toBe('a');
    expect(exampleFromSchema({ type: 'integer', minimum: 5 }, spec)).toBe(5);
    expect(exampleFromSchema({ type: 'array', items: { type: 'boolean' } }, spec)).toEqual([true]);
  });

  it('ignores documented examples that contradict the schema type', () => {
    // A poisoned spec: an array property carrying a string example.
    const poisoned = {
      type: 'array',
      example: 'sample value',
      items: { type: 'object', properties: { qty: { type: 'integer' } } },
    };
    expect(exampleFromSchema(poisoned, spec)).toEqual([{ qty: 1 }]);

    const objectPoisoned = { type: 'object', example: '123 Main St', properties: { city: { type: 'string' } } };
    expect(exampleFromSchema(objectPoisoned, spec)).toEqual({ city: 'example' });
  });

  it('is deterministic across calls', () => {
    const a = exampleFromSchema({ $ref: '#/components/schemas/User' }, spec);
    const b = exampleFromSchema({ $ref: '#/components/schemas/User' }, spec);
    expect(a).toEqual(b);
  });
});

describe('generateScenarios', () => {
  const scenarios = generateScenarios(spec);
  const users = scenarios.find(s => s.name === 'Users flow')!;

  it('produces one scenario per tag', () => {
    expect(scenarios.map(s => s.name).sort()).toEqual(['Auth flow', 'Users flow']);
  });

  it('logs in first and captures the token', () => {
    expect(users.steps[0].name).toBe('Log in');
    expect(users.steps[0].capture).toEqual({ token: '$.accessToken' });
  });

  it('registers before logging in, so fresh servers have the account', () => {
    const auth = scenarios.find(s => s.name === 'Auth flow')!;
    const names = auth.steps.map(s => s.name);
    expect(names.indexOf('Register')).toBeLessThan(names.indexOf('Log in'));
    // The register step cannot carry the token — it does not exist yet.
    expect(auth.steps[names.indexOf('Register')].request.headers).toBeUndefined();
  });

  it('orders create before read before delete', () => {
    const names = users.steps.map(s => s.name);
    expect(names.indexOf('Create a user')).toBeLessThan(names.indexOf('List users'));
    expect(names.indexOf('List users')).toBeLessThan(names.indexOf('Get one user'));
    expect(names.indexOf('Delete a user')).toBe(names.length - 1);
  });

  it('captures the created id and uses it in the /:id routes', () => {
    const create = users.steps.find(s => s.name === 'Create a user')!;
    expect(create.capture).toEqual({ usersId: '$.id' });

    const read = users.steps.find(s => s.name === 'Get one user')!;
    expect(read.request.path).toBe('/users/{{usersId}}');
  });

  it('adds the bearer header to authorized steps', () => {
    const read = users.steps.find(s => s.name === 'Get one user')!;
    expect(read.request.headers?.Authorization).toBe('Bearer {{token}}');
  });

  it('asserts the documented status and schema conformance', () => {
    const create = users.steps.find(s => s.name === 'Create a user')!;
    expect(create.expect).toEqual({ status: 201, matchesSpec: true });

    const del = users.steps.find(s => s.name === 'Delete a user')!;
    expect(del.expect).toEqual({ status: 204 });
  });

  it('generates request bodies from the documented schema', () => {
    const create = users.steps.find(s => s.name === 'Create a user')!;
    expect((create.request.body as any).email).toBe('user@example.com');
  });

  it('names files from the tag', () => {
    expect(scenarioFileName(users)).toBe('users.scenario.json');
  });

  it('returns an empty array for an empty spec', () => {
    expect(generateScenarios({ paths: {} })).toEqual([]);
  });
});

describe('generated scenarios are runnable', () => {
  it('passes end-to-end against a fake API that honours the contract', async () => {
    const users: any[] = [];
    const fetchImpl = async (url: string, init: any) => {
      const respond = (status: number, body?: unknown) => ({
        status,
        text: async () => (body === undefined ? '' : JSON.stringify(body)),
      });

      if (init.method === 'POST' && url.endsWith('/auth/login')) {
        return respond(201, { accessToken: 'jwt-1', tokenType: 'Bearer' });
      }
      if (init.method === 'POST' && url.endsWith('/users')) {
        const user = { id: 7, name: 'Example Name', email: 'user@example.com' };
        users.push(user);
        return respond(201, user);
      }
      if (init.method === 'GET' && url.endsWith('/users')) return respond(200, users);
      if (init.method === 'GET' && url.endsWith('/users/7')) return respond(200, users[0]);
      if (init.method === 'DELETE' && url.endsWith('/users/7')) return respond(204);
      return respond(404, { error: 'not found' });
    };

    const scenario = generateScenarios(spec).find(s => s.name === 'Users flow')!;
    const result = await runScenario(scenario, { fetchImpl, spec });

    expect(result.steps.map(s => `${s.name}:${s.passed}`)).toEqual([
      'Log in:true',
      'Create a user:true',
      'List users:true',
      'Get one user:true',
      'Delete a user:true',
    ]);
    expect(result.passed).toBe(true);
  });
});
