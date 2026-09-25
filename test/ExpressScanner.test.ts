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

  it('resolves app.use router mounts and prefixes child routes', () => {
    const root = makeProject({
      'src/app.js': "const users = require('./routes/users');\napp.use('/api/users', users);",
      'src/routes/users.js': `
        const router = require('express').Router();
        router.get('/', listUsers);
        router.get('/:id', getUser);
        router.post('/', createUser);
        module.exports = router;
      `,
    });
    roots.push(root);

    const controllers = ExpressScanner.scan(path.join(root, 'src'));
    const routes = controllers.flatMap(c => c.routes);
    expect(routes.map(r => `${r.method} ${r.path}`)).toEqual([
      'get /api/users',
      'get /api/users/{id}',
      'post /api/users',
    ]);
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

  it('infers JSON body schema from req.body destructuring', () => {
    const root = makeProject({
      'src/routes/users.js': `
        app.post('/users', (req, res) => {
          const { name, email } = req.body;
          if (!name || !email) return res.status(400).json({ message: 'required' });
          res.status(201).json({ id: 1, name, email });
        });
      `,
    });
    roots.push(root);

    const controllers = ExpressScanner.scan(path.join(root, 'src'));
    const route = controllers[0].routes[0];
    expect(route.bodySchema).toBeDefined();
    expect(Object.keys(route.bodySchema!.properties)).toEqual(['name', 'email']);
    expect(route.bodySchema!.required).toEqual(['name', 'email']);
    expect(route.consumes).toEqual(['application/json']);
  });

  it('ignores default values when inferring body fields', () => {
    const root = makeProject({
      'src/routes/products.js': `
        app.post('/products', (req, res) => {
          const { name, price, status = 'active' } = req.body;
          if (!name || price == null) return res.status(400).json({ message: 'required' });
          res.status(201).json({ id: 1, name, price, status });
        });
      `,
    });
    roots.push(root);

    const controllers = ExpressScanner.scan(path.join(root, 'src'));
    const route = controllers[0].routes[0];
    expect(Object.keys(route.bodySchema!.properties)).toEqual(['name', 'price', 'status']);
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
