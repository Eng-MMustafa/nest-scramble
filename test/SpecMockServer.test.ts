/**
 * Tests for the OpenAPI-driven mock used by `nest-scramble serve`.
 */
import { SpecMockServer } from '../src/standalone/SpecMockServer';

const spec = {
  openapi: '3.0.0',
  paths: {
    '/api/users': {
      get: { responses: { '200': { description: 'OK', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/User' } } } } } } },
      post: {
        responses: {
          '201': { description: 'Created', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'integer' } } }, example: { id: 42, name: 'Alice' } } } },
          '400': { description: 'Bad Request' },
        },
      },
    },
    '/api/users/{id}': {
      get: { responses: { '200': { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } }, '404': { description: 'Not Found' } } },
      delete: { responses: { '204': { description: 'No Content' } } },
    },
    '/api/users/me': {
      get: { responses: { '200': { description: 'OK', content: { 'application/json': { example: { id: 1, name: 'Me' } } } } } },
    },
    '/health': { get: { responses: { '200': { description: 'OK' } } } },
  },
  components: {
    schemas: {
      User: {
        type: 'object',
        required: ['id', 'email', 'name', 'role', 'createdAt'],
        properties: {
          id: { type: 'integer' },
          email: { type: 'string', format: 'email' },
          name: { type: 'string' },
          role: { type: 'string', enum: ['admin', 'user'] },
          age: { type: 'integer', minimum: 18, maximum: 30 },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
};

describe('SpecMockServer', () => {
  const mock = new SpecMockServer(spec);

  it('returns null for undocumented routes', () => {
    expect(mock.handle('GET', '/nope')).toBeNull();
    expect(mock.handle('PATCH', '/api/users')).toBeNull();
  });

  it('prefers the documented example', () => {
    const result = mock.handle('POST', '/api/users')!;
    expect(result.status).toBe(201);
    expect(result.body).toEqual({ id: 42, name: 'Alice' });
    expect(result.headers['X-Scramble-Mock']).toBe('true');
  });

  it('generates realistic data from $ref schemas, honouring enums, formats and ranges', () => {
    const result = mock.handle('GET', '/api/users/7')!;
    expect(result.status).toBe(200);
    const user = result.body as any;
    expect(typeof user.id).toBe('number');
    expect(user.email).toMatch(/@/);
    expect(['admin', 'user']).toContain(user.role);
    if (user.age !== undefined) { expect(user.age).toBeGreaterThanOrEqual(18); expect(user.age).toBeLessThanOrEqual(30); }
    expect(new Date(user.createdAt).toString()).not.toBe('Invalid Date');
  });

  it('returns arrays for list endpoints', () => {
    const list = mock.handle('GET', '/api/users')!.body as any[];
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);
    expect(list[0].email).toMatch(/@/);
  });

  it('routes static segments ahead of parameters', () => {
    expect(mock.handle('GET', '/api/users/me')!.body).toEqual({ id: 1, name: 'Me' });
  });

  it('sends bodiless statuses without a payload and empty objects for schema-less 200s', () => {
    const removed = mock.handle('DELETE', '/api/users/1')!;
    expect(removed.status).toBe(204);
    expect(removed.body).toBeUndefined();
    expect(mock.handle('GET', '/health')!.body).toEqual({});
    expect(mock.handle('GET', '/api/users?page=2')).toBeNull(); // caller strips the query string
  });
});
