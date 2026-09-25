/**
 * Tests for the Express docs naming helpers (group labels + body schema names).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { bodySchemaName, friendlyName, friendlyNames } from '../src/express/ExpressNaming';
import { ExpressScanner } from '../src/express/ExpressScanner';
import { ExpressOpenApiTransformer } from '../src/express/ExpressOpenApiTransformer';

describe('ExpressNaming', () => {
  describe('friendlyName', () => {
    it.each([
      ['src/routes/orders.js', 'Orders'],
      ['src/users.routes.ts', 'Users'],
      ['src/api/products.controller.js', 'Products'],
      ['src/websocket/orders.gateway.js', 'OrdersGateway'],
      ['src/app.js', 'App'],
      ['src/orders/index.js', 'Orders'],
      ['src/routes/index.js', 'Index'],
      ['src/graphql/schema.js', 'Schema'],
    ])('%s → %s', (file, expected) => {
      expect(friendlyName(file)).toBe(expected);
    });
  });

  it('disambiguates colliding names with the parent directory', () => {
    const names = friendlyNames(['src/admin/users.js', 'src/public/users.js', 'src/orders.js']);
    expect(names.get('src/admin/users.js')).toBe('AdminUsers');
    expect(names.get('src/public/users.js')).toBe('PublicUsers');
    expect(names.get('src/orders.js')).toBe('Orders');
  });

  describe('bodySchemaName', () => {
    it.each([
      ['post', '/api/users', 'CreateUserBody'],
      ['put', '/api/users/{id}', 'UpdateUserBody'],
      ['patch', '/api/v1/categories/{id}', 'UpdateCategoryBody'],
      ['post', '/api/auth/login', 'LoginBody'],
      ['post', '/api/products/{id}/image', 'ImageBody'],
    ])('%s %s → %s', (method, routePath, expected) => {
      expect(bodySchemaName(method, routePath)).toBe(expected);
    });
  });
});

describe('ExpressOpenApiTransformer — named body schemas', () => {
  let root: string;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'scramble-express-naming-'));
    fs.mkdirSync(path.join(root, 'src/routes'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/app.js'), `
      const express = require('express');
      const app = express();
      app.use('/api/users', require('./routes/users'));
      app.listen(3000);
    `);
    fs.writeFileSync(path.join(root, 'src/routes/users.js'), `
      const router = require('express').Router();
      router.post('/', (req, res) => {
        const { name, email } = req.body;
        if (!name || !email) return res.status(400).json({});
        res.status(201).json({});
      });
      router.put('/:id', (req, res) => {
        const { name } = req.body;
        res.json({});
      });
      module.exports = router;
    `);
  });

  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  it('labels groups like controllers and registers bodies as components', () => {
    const controllers = ExpressScanner.scan(path.join(root, 'src'));
    expect(controllers.map((c) => c.name)).toEqual(['Users']);

    const spec = new ExpressOpenApiTransformer().transform(controllers);
    expect(Object.keys(spec.components.schemas).sort()).toEqual(['CreateUserBody', 'UpdateUserBody']);
    expect(spec.components.schemas.CreateUserBody).toEqual({
      type: 'object',
      properties: { name: { type: 'string' }, email: { type: 'string' } },
      required: ['name', 'email'],
    });
    expect(spec.paths['/api/users'].post.requestBody.content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/CreateUserBody',
    });
    expect(spec.paths['/api/users'].post.tags).toEqual(['Users']);
  });
});
