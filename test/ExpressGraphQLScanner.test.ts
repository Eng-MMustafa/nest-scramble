/**
 * Tests for the Express GraphQL scanner: SDL discovery, the `graphql`-package
 * parser path, the regex fallback, and the generated samples/schemas.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ExpressGraphQLScanner } from '../src/express/ExpressGraphQLScanner';

function makeProject(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scramble-gql-'));
  for (const [relative, contents] of Object.entries(files)) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }
  return root;
}

/** Points the project at this repo's own `graphql` dev dependency, if installed. */
function linkGraphqlPackage(root: string): boolean {
  let source: string;
  try {
    source = path.dirname(require.resolve('graphql/package.json'));
  } catch {
    return false;
  }
  const target = path.join(root, 'node_modules', 'graphql');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  try {
    fs.symlinkSync(source, target, 'junction');
    return true;
  } catch {
    return false;
  }
}

const RICH_SDL = `
  """A blog post"""
  interface Node { id: ID! }
  enum Status { DRAFT PUBLISHED }
  scalar DateTime
  type Author implements Node { id: ID! name: String! posts: [Post!]! }
  type Post implements Node {
    id: ID!
    "Short headline"
    title: String!
    content: String
    status: Status!
    author: Author!
    publishedAt: DateTime
    comments(first: Int = 10): [String!]!
  }
  type Draft { id: ID! notes: String }
  union SearchResult = Post | Author
  input CreatePostInput { title: String!, content: String, status: Status = DRAFT }
  type Query {
    "All posts, newest first"
    posts(status: Status, limit: Int = 20): [Post!]!
    post(id: ID!): Post
    search(term: String!): [SearchResult!]!
  }
  type Mutation { createPost(input: CreatePostInput!): Post! }
  extend type Mutation { deletePost(id: ID!): Boolean! }
  type Subscription { postAdded: Post! }
`;

describe('ExpressGraphQLScanner', () => {
  const roots: string[] = [];
  afterAll(() => { for (const root of roots) fs.rmSync(root, { recursive: true, force: true }); });

  function expectRichModel(operations: ReturnType<typeof ExpressGraphQLScanner.scan>[0]['operations']) {
    const byName = Object.fromEntries(operations.map((o) => [o.name, o]));
    expect(Object.keys(byName).sort()).toEqual(['createPost', 'deletePost', 'post', 'postAdded', 'posts', 'search']);

    // Selection sets skip fields that need arguments and nest one level deep.
    expect(byName.posts.sample).toBe(
      'query posts($status: Status, $limit: Int = 20) { posts(status: $status, limit: $limit) { id title content status author { id name } publishedAt } }'
        .replace('$limit: Int = 20', '$limit: Int'),
    );
    expect(byName.posts.args!.map((a) => [a.name, a.required])).toEqual([['status', false], ['limit', false]]);
    expect(byName.posts.args![0].schema).toMatchObject({ type: 'string', enum: ['DRAFT', 'PUBLISHED'] });
    expect(byName.posts.response).toMatchObject({ type: 'array', items: { type: 'object', required: expect.arrayContaining(['id', 'title', 'status', 'author']) } });
    expect(byName.posts.response.items.properties.publishedAt).toMatchObject({ type: 'string', format: 'date-time', nullable: true });

    // Input types expand into real variable schemas with enum defaults respected.
    expect(byName.createPost.args![0]).toMatchObject({ name: 'input', required: true, graphqlType: 'CreatePostInput!' });
    expect(byName.createPost.args![0].schema).toMatchObject({
      type: 'object',
      properties: { title: { type: 'string' }, content: { type: 'string', nullable: true }, status: { type: 'string', enum: ['DRAFT', 'PUBLISHED'] } },
      required: ['title'],
    });
    expect(byName.createPost.sample).toBe('mutation createPost($input: CreatePostInput!) { createPost(input: $input) { id title content status author { id name } publishedAt } }');

    // `extend type Mutation` merges; scalars map; unions produce inline fragments.
    expect(byName.deletePost.response).toEqual({ type: 'boolean' });
    expect(byName.search.sample).toContain('... on Post');
    expect(byName.search.sample).toContain('... on Author');
    expect(byName.postAdded.kind).toBe('subscription');
  }

  it('uses the project\'s graphql package when available (interfaces, unions, descriptions, extend)', () => {
    const root = makeProject({
      'src/graphql/schema.js': `
        const { buildSchema } = require('graphql');
        module.exports = buildSchema(\`${RICH_SDL}\`);
      `,
    });
    roots.push(root);
    if (!linkGraphqlPackage(root)) return; // graphql not installed here — the regex test below still covers the model

    const [resolver] = ExpressGraphQLScanner.scan(path.join(root, 'src'));
    expect(resolver.parser).toBe('graphql');
    expect(resolver.name).toBe('GraphQL');
    expectRichModel(resolver.operations);
    // Descriptions only survive through the real parser.
    expect(resolver.operations.find((o) => o.name === 'posts')!.summary).toBe('All posts, newest first');
  });

  it('falls back to the regex parser and still builds the same model', () => {
    const root = makeProject({
      'src/graphql/typeDefs.ts': `
        import { gql } from 'apollo-server-express';
        export const typeDefs = gql\`${RICH_SDL}\`;
      `,
    });
    roots.push(root);

    const [resolver] = ExpressGraphQLScanner.scan(path.join(root, 'src'));
    expect(resolver.parser).toBe('regex');
    expectRichModel(resolver.operations);
  });

  it('reads .graphql files and names them after the file', () => {
    const root = makeProject({
      'src/schema/posts.graphql': 'type Post { id: ID! title: String! }\ntype Query { posts: [Post!]! }',
    });
    roots.push(root);
    const [resolver] = ExpressGraphQLScanner.scan(path.join(root, 'src'));
    expect(resolver.name).toBe('PostsResolver');
    expect(resolver.operations.map((o) => o.sample)).toEqual(['query { posts { id title } }']);
  });

  it('ignores gql templates that are client operations, not schema', () => {
    const root = makeProject({
      'src/client/queries.js': 'const GET_POSTS = gql`query { posts { id } }`;',
    });
    roots.push(root);
    expect(ExpressGraphQLScanner.scan(path.join(root, 'src'))).toEqual([]);
  });
});
