/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import {
  buildGraphQLDocument,
  buildSampleOperation,
  ResolverInfo,
  ResolverScanner,
} from '../src/graphql/ResolverScanner';
import { ScrambleLogger } from '../src/utils/ScrambleLogger';

const FIXTURE_SOURCE = 'test/fixtures/graphql-app';

describe('ResolverScanner', () => {
  jest.setTimeout(120_000);

  let resolvers: ResolverInfo[];
  let users: ResolverInfo;

  const findOp = (name: string) => {
    const op = users.operations.find(o => o.name === name);
    if (!op) throw new Error(`Fixture operation "${name}" not found`);
    return op;
  };

  beforeAll(() => {
    ScrambleLogger.configure('silent');
    resolvers = new ResolverScanner().scanResolvers(FIXTURE_SOURCE);
    const found = resolvers.find(r => r.name === 'UsersResolver');
    if (!found) throw new Error('UsersResolver fixture was not discovered');
    users = found;
  });

  afterAll(() => {
    ScrambleLogger.configure('info');
  });

  it('finds classes decorated with @Resolver and reads the model type', () => {
    expect(resolvers).toHaveLength(1);
    expect(users.typeName).toBe('UserModel');
  });

  it('extracts queries, mutations and subscriptions — not helpers', () => {
    expect(users.operations.map(o => `${o.kind}:${o.name}`).sort()).toEqual([
      'mutation:createUser',
      'query:user',
      'query:users',
      'subscription:userAdded',
    ]);
  });

  it('prefers the decorator name option over the method name', () => {
    expect(findOp('users').methodName).toBe('findAll');
  });

  it('reads @Args names, types and nullability', () => {
    const op = findOp('users');
    expect(op.args).toHaveLength(1);
    expect(op.args[0]).toMatchObject({ name: 'limit', isOptional: true });

    const create = findOp('createUser');
    expect(create.args[0].name).toBe('input');
    expect((create.args[0].type.properties || []).map(p => p.name).sort()).toEqual([
      'bio',
      'email',
      'name',
    ]);
  });

  it('analyzes the return type', () => {
    const op = findOp('user');
    expect(op.returnType?.type).toBe('UserModel');
    expect((op.returnType?.properties || []).map(p => p.name).sort()).toEqual([
      'email',
      'id',
      'name',
    ]);
  });

  it('reads the JSDoc summary and description', () => {
    const op = findOp('users');
    expect(op.summary).toBe('List every registered user.');
    expect(op.description).toContain('newest first');
  });

  it('returns an empty array for a directory without resolvers', () => {
    expect(new ResolverScanner().scanResolvers('test/fixtures/sample-app')).toEqual([]);
  });

  describe('buildSampleOperation', () => {
    it('builds a runnable query with args and a selection set', () => {
      const sample = buildSampleOperation(findOp('user'));
      expect(sample).toContain('query {');
      expect(sample).toContain('user(id: 1)');
      expect(sample).toContain('email');
    });

    it('renders input objects as GraphQL literals', () => {
      const sample = buildSampleOperation(findOp('createUser'));
      expect(sample).toContain('mutation {');
      expect(sample).toContain('createUser(input: {');
      expect(sample).toContain('name: "example"');
      // Optional fields stay out of the sample.
      expect(sample).not.toContain('bio');
    });

    it('omits optional args', () => {
      expect(buildSampleOperation(findOp('users'))).not.toContain('limit');
    });
  });

  describe('buildGraphQLDocument', () => {
    it('produces schemas and samples for the docs UI', () => {
      const doc = buildGraphQLDocument(resolvers, { title: 'API', version: '1.0.0' });
      expect(doc.resolvers).toHaveLength(1);

      const create = doc.resolvers[0].operations.find((o: any) => o.name === 'createUser');
      expect(create.args[0].schema.type).toBe('object');
      expect(create.args[0].required).toBe(true);
      expect(create.response.properties.id.type).toBe('number');
      expect(create.sample).toContain('mutation {');
    });
  });
});
