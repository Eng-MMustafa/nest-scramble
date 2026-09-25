/**
 * Tests for the heuristic Express GraphQL scanner.
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

describe('ExpressGraphQLScanner', () => {
  const roots: string[] = [];

  afterAll(() => {
    for (const root of roots) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('extracts Query and Mutation operations with subfield samples', () => {
    const root = makeProject({
      'src/graphql/schema.js': `
        const { buildSchema } = require('graphql');
        module.exports = buildSchema(\`
          type Post { id: ID! title: String! content: String! }
          type Query { posts: [Post!]! post(id: ID!): Post }
          type Mutation { createPost(title: String!): Post }
        \`);
      `,
    });
    roots.push(root);

    const resolvers = ExpressGraphQLScanner.scan(path.join(root, 'src'));
    expect(resolvers).toHaveLength(1);
    const ops = resolvers[0].operations.map((op) => `${op.kind} ${op.name}: ${op.sample}`);
    expect(ops).toEqual([
      'query posts: query { posts { id title content } }',
      'query post: query { post { id title content } }',
      'mutation createPost: mutation { createPost { id title content } }',
    ]);
  });
});
