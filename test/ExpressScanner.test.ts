/**
 * Tests for the heuristic Express route scanner.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ExpressScanner } from '../src/express/ExpressScanner';
import { ExpressOpenApiTransformer } from '../src/express/ExpressOpenApiTransformer';

function makeProject(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scramble-express-'));
  for (const [relative, contents] of Object.entries(files)) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }
  return root;
}

describe('ExpressScanner', () => {
  const roots: string[] = [];

  afterAll(() => {
    for (const root of roots) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('finds app/router method routes', () => {
    const root = makeProject({
      'src/routes/users.js': `
        app.get('/users', listUsers);
        router.post('/users', createUser);
        app.get('/users/:id', getUser);
      `,
    });
    roots.push(root);

    const controllers = ExpressScanner.scan(path.join(root, 'src'));
    expect(controllers).toHaveLength(1);
    expect(controllers[0].routes.map(r => `${r.method} ${r.path}`)).toEqual([
      'get /users',
      'post /users',
      'get /users/{id}',
    ]);
  });

  it('finds app.use mounts', () => {
    const root = makeProject({
      'src/app.js': "app.use('/api/users', require('./routes/users'));",
    });
    roots.push(root);

    const controllers = ExpressScanner.scan(path.join(root, 'src'));
    expect(controllers[0].routes).toHaveLength(1);
    expect(controllers[0].routes[0].method).toBe('use');
    expect(controllers[0].routes[0].path).toBe('/api/users');
  });

  it('ignores node_modules and build directories', () => {
    const root = makeProject({
      'src/routes/users.js': "app.get('/users', listUsers);",
      'src/node_modules/vendor.js': "app.get('/secret', () => {});",
      'src/dist/bundle.js': "app.get('/stale', () => {});",
    });
    roots.push(root);

    const controllers = ExpressScanner.scan(path.join(root, 'src'));
    const routes = controllers.flatMap(c => c.routes);
    expect(routes.map(r => r.path)).toEqual(['/users']);
  });
});

describe('ExpressOpenApiTransformer', () => {
  it('produces a valid OpenAPI document from scanned routes', () => {
    const spec = new ExpressOpenApiTransformer().transform([
      {
        name: 'users',
        filePath: '/users.js',
        basePath: '',
        routes: [
          { method: 'get', path: '/users', parameters: [] },
          { method: 'post', path: '/users', parameters: [] },
          { method: 'get', path: '/users/{id}', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }] },
        ],
      },
    ]);

    expect(spec.openapi).toBe('3.0.0');
    expect(Object.keys(spec.paths)).toEqual(['/users', '/users/{id}']);
    expect(spec.paths['/users'].get).toBeDefined();
    expect(spec.paths['/users'].post).toBeDefined();
    expect(spec.paths['/users/{id}'].get.parameters).toHaveLength(1);
  });
});
