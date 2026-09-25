/**
 * Tests for Express request-body / response inference across the validation
 * styles real projects use: Zod, Joi, express-validator, TypeScript DTOs,
 * plain `req.body` access, and `res.status().json()` literals.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ExpressScanner, ExpressRouteInfo } from '../src/express/ExpressScanner';
import { ExpressOpenApiTransformer } from '../src/express/ExpressOpenApiTransformer';

function makeProject(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scramble-express-infer-'));
  for (const [relative, contents] of Object.entries(files)) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }
  return root;
}

function routesOf(root: string): ExpressRouteInfo[] {
  return ExpressScanner.scan(path.join(root, 'src')).flatMap((c) => c.routes);
}

function find(routes: ExpressRouteInfo[], method: string, p: string): ExpressRouteInfo {
  const route = routes.find((r) => r.method === method && r.path === p);
  if (!route) throw new Error(`route ${method} ${p} not found in ${routes.map((r) => r.method + ' ' + r.path).join(', ')}`);
  return route;
}

describe('ExpressBodyInference', () => {
  const roots: string[] = [];
  afterAll(() => { for (const root of roots) fs.rmSync(root, { recursive: true, force: true }); });

  it('reads Zod schemas defined in another file, including chains, enums, nested objects and arrays', () => {
    const root = makeProject({
      'src/schemas/user.schema.ts': `
        import { z } from 'zod';
        export const AddressSchema = z.object({ street: z.string(), city: z.string().min(2) });
        export const CreateUserSchema = z.object({
          name: z.string().min(2).max(50).describe('Display name'),
          email: z.string().email(),
          age: z.number().int().positive().optional(),
          role: z.enum(['admin', 'user']).default('user'),
          tags: z.array(z.string()).max(5),
          address: AddressSchema.optional(),
          website: z.string().url().nullable(),
          active: z.coerce.boolean(),
        });
        export const UpdateUserSchema = CreateUserSchema.partial();
      `,
      'src/routes/users.ts': `
        import { Router } from 'express';
        import { CreateUserSchema, UpdateUserSchema } from '../schemas/user.schema';
        import { validate } from '../middleware/validate';
        const router = Router();
        router.post('/', validate(CreateUserSchema), (req, res) => { res.status(201).json({ id: 1 }); });
        router.put('/:id', (req, res) => {
          const data = UpdateUserSchema.parse(req.body);
          res.json(data);
        });
        export default router;
      `,
      'src/middleware/validate.ts': 'export const validate = (s: any) => (req: any, res: any, next: any) => next();',
      'src/app.ts': `
        import express from 'express';
        import users from './routes/users';
        const app = express();
        app.use('/api/users', users);
        app.listen(3000);
      `,
    });
    roots.push(root);
    const routes = routesOf(root);

    const create = find(routes, 'post', '/api/users');
    expect(create.bodySchema!.source).toBe('zod');
    expect(create.bodySchema!.name).toBe('CreateUserSchema');
    expect(create.bodySchema!.required.sort()).toEqual(['active', 'email', 'name', 'tags', 'website']);
    expect(create.bodySchema!.properties).toMatchObject({
      name: { type: 'string', minLength: 2, maxLength: 50, description: 'Display name' },
      email: { type: 'string', format: 'email' },
      age: { type: 'integer', minimum: 1 },
      role: { type: 'string', enum: ['admin', 'user'], default: 'user' },
      tags: { type: 'array', items: { type: 'string' }, maxItems: 5 },
      address: { type: 'object', properties: { street: { type: 'string' }, city: { type: 'string', minLength: 2 } }, required: ['street', 'city'] },
      website: { type: 'string', format: 'uri', nullable: true },
      active: { type: 'boolean' },
    });

    const update = find(routes, 'put', '/api/users/{id}');
    expect(update.bodySchema!.name).toBe('UpdateUserSchema');
    expect(update.bodySchema!.required).toEqual([]);
    expect(Object.keys(update.bodySchema!.properties)).toContain('email');
  });

  it('reads Joi schemas (optional by default, required() opt-in)', () => {
    const root = makeProject({
      'src/app.js': `
        const express = require('express');
        const Joi = require('joi');
        const app = express();
        const orderSchema = Joi.object({
          productId: Joi.number().integer().required(),
          quantity: Joi.number().min(1).max(10).default(1),
          note: Joi.string().max(200),
          status: Joi.string().valid('pending', 'paid').required(),
          gift: Joi.boolean(),
        });
        app.post('/orders', (req, res) => {
          const { error, value } = orderSchema.validate(req.body);
          if (error) return res.status(400).json({ message: error.message });
          res.status(201).json(value);
        });
        app.listen(3000);
      `,
    });
    roots.push(root);
    const create = find(routesOf(root), 'post', '/orders');
    expect(create.bodySchema!.source).toBe('joi');
    expect(create.bodySchema!.required.sort()).toEqual(['productId', 'status']);
    expect(create.bodySchema!.properties).toMatchObject({
      productId: { type: 'integer' },
      quantity: { type: 'number', minimum: 1, maximum: 10, default: 1 },
      note: { type: 'string', maxLength: 200 },
      status: { type: 'string', enum: ['pending', 'paid'] },
      gift: { type: 'boolean' },
    });
  });

  it('reads express-validator chains passed as middleware', () => {
    const root = makeProject({
      'src/app.js': `
        const express = require('express');
        const { body, validationResult } = require('express-validator');
        const app = express();
        const validateProduct = [
          body('name').notEmpty().isString().trim(),
          body('price').isFloat({ min: 0 }),
          body('category').optional().isIn(['books', 'games']),
          body('inStock').isBoolean(),
        ];
        app.post('/products', validateProduct, (req, res) => {
          const errors = validationResult(req);
          if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
          res.status(201).json(req.body);
        });
        app.post('/inline', [body('email').isEmail().notEmpty()], (req, res) => res.json({}));
      `,
    });
    roots.push(root);
    const routes = routesOf(root);

    const product = find(routes, 'post', '/products');
    expect(product.bodySchema!.source).toBe('express-validator');
    expect(product.bodySchema!.required).toEqual(['name']);
    expect(product.bodySchema!.properties).toMatchObject({
      name: { type: 'string' },
      price: { type: 'number', minimum: 0 },
      category: { type: 'string', enum: ['books', 'games'] },
      inStock: { type: 'boolean' },
    });
    expect(product.responses!['422']).toBeDefined();

    const inline = find(routes, 'post', '/inline');
    expect(inline.bodySchema!.properties.email).toEqual({ type: 'string', format: 'email' });
    expect(inline.bodySchema!.required).toEqual(['email']);
  });

  it('reads TypeScript DTOs from Request generics, casts and annotations across files', () => {
    const root = makeProject({
      'src/dto/index.ts': `
        export * from './user.dto';
      `,
      'src/dto/user.dto.ts': `
        export enum Role { Admin = 'admin', User = 'user' }
        export interface Timestamps { createdAt?: Date }
        export interface CreateUserDto extends Timestamps {
          name: string;
          email: string;
          age?: number;
          role: Role;
          nickname: string | null;
          tags: string[];
          status: 'active' | 'blocked';
          address: { street: string; zip?: string };
          settings: Record<string, boolean>;
        }
        export type UpdateUserDto = Partial<CreateUserDto>;
        export class LoginDto { username!: string; password!: string; remember?: boolean; }
      `,
      'src/routes/users.ts': `
        import { Request, Response, Router } from 'express';
        import { CreateUserDto, UpdateUserDto, LoginDto } from '../dto';
        const router = Router();
        router.post('/', (req: Request<{}, {}, CreateUserDto>, res: Response) => { res.status(201).json({ ok: true }); });
        router.patch('/:id', (req: Request, res: Response) => {
          const dto = req.body as UpdateUserDto;
          res.json(dto);
        });
        router.post('/login', (req, res) => {
          const body: LoginDto = req.body;
          res.json({ token: 'x' });
        });
        export default router;
      `,
      'src/app.ts': `
        import express from 'express';
        import users from './routes/users';
        const app = express();
        app.use('/users', users);
      `,
    });
    roots.push(root);
    const routes = routesOf(root);

    const create = find(routes, 'post', '/users');
    expect(create.bodySchema!.source).toBe('typescript');
    expect(create.bodySchema!.name).toBe('CreateUserDto');
    // `string | null` is nullable but still required; `age?` and inherited `createdAt?` are not.
    expect(create.bodySchema!.required.sort()).toEqual(['address', 'email', 'name', 'nickname', 'role', 'settings', 'status', 'tags']);
    expect(create.bodySchema!.properties).toMatchObject({
      name: { type: 'string' },
      age: { type: 'number' },
      role: { type: 'string', enum: ['admin', 'user'] },
      nickname: { type: 'string', nullable: true },
      tags: { type: 'array', items: { type: 'string' } },
      status: { type: 'string', enum: ['active', 'blocked'] },
      address: { type: 'object', properties: { street: { type: 'string' }, zip: { type: 'string' } }, required: ['street'] },
      settings: { type: 'object', additionalProperties: { type: 'boolean' } },
      createdAt: { type: 'string', format: 'date-time' },
    });

    const update = find(routes, 'patch', '/users/{id}');
    expect(update.bodySchema!.name).toBe('UpdateUserDto');
    expect(update.bodySchema!.required).toEqual([]);
    expect(Object.keys(update.bodySchema!.properties)).toEqual(expect.arrayContaining(['name', 'email', 'role']));

    const login = find(routes, 'post', '/users/login');
    expect(login.bodySchema!.name).toBe('LoginDto');
    expect(login.bodySchema!.required.sort()).toEqual(['password', 'username']);
    expect(login.bodySchema!.properties.remember).toEqual({ type: 'boolean' });
  });

  it('falls back to req.body property access with type guesses, and documents response literals', () => {
    const root = makeProject({
      'src/app.js': `
        const express = require('express');
        const app = express();
        app.post('/items', requireAuth, (req, res) => {
          if (!req.body.title) return res.status(400).json({ message: 'title is required' });
          const price = Number(req.body.price);
          const item = { id: Date.now(), title: req.body.title, price, isActive: req.body.isActive === true };
          res.status(201).json({ id: item.id, title: item.title, price: item.price, created: true });
        });
        app.get('/items/:id', (req, res) => {
          const item = items.find((i) => i.id === req.params.id);
          if (!item) return res.status(404).json({ message: 'Item not found', code: 'ITEM_404' });
          res.json(item);
        });
        app.delete('/items/:id', requireAuth, (req, res) => { res.sendStatus(204); });
      `,
    });
    roots.push(root);
    const routes = routesOf(root);

    const create = find(routes, 'post', '/items');
    expect(create.bodySchema!.source).toBe('property-access');
    expect(create.bodySchema!.required).toEqual(['title']);
    expect(create.bodySchema!.properties).toEqual({
      title: { type: 'string' },
      price: { type: 'number' },
      isActive: { type: 'boolean' },
    });
    expect(create.responses!['400'].content['application/json']).toEqual({
      schema: { type: 'object', properties: { message: { type: 'string' } } },
      example: { message: 'title is required' },
    });
    expect(create.responses!['201'].content['application/json'].schema).toEqual({
      type: 'object',
      properties: { id: { type: 'string' }, title: { type: 'string' }, price: { type: 'number' }, created: { type: 'boolean' } },
    });
    expect(create.responses!['401']).toEqual({ description: 'Unauthorized' });
    expect(create.security).toEqual([{ bearerAuth: [] }]);

    const get = find(routes, 'get', '/items/{id}');
    expect(get.responses!['404'].content['application/json'].example).toEqual({ message: 'Item not found', code: 'ITEM_404' });
    expect(get.responses!['200']).toEqual({ description: 'OK' });
    expect(get.consumes).toBeUndefined();

    const remove = find(routes, 'delete', '/items/{id}');
    expect(Object.keys(remove.responses!).sort()).toEqual(['204', '401']);
  });

  it('derives Update bodies from the Create body when a PUT just assigns req.body', () => {
    const root = makeProject({
      'src/app.js': `
        const express = require('express');
        const app = express();
        app.post('/api/users', (req, res) => {
          const { name, email } = req.body;
          if (!name || !email) return res.status(400).json({ message: 'name and email are required' });
          res.status(201).json({ id: 1, name, email });
        });
        app.put('/api/users/:id', (req, res) => {
          Object.assign(user, req.body);
          res.json(user);
        });
      `,
    });
    roots.push(root);
    const spec = new ExpressOpenApiTransformer().transform(ExpressScanner.scan(path.join(root, 'src')));

    expect(Object.keys(spec.components.schemas).sort()).toEqual(['CreateUserBody', 'UpdateUserBody']);
    expect(spec.components.schemas.UpdateUserBody).toMatchObject({
      properties: { name: { type: 'string' }, email: { type: 'string' } },
      required: [],
    });
    expect(spec.paths['/api/users/{id}'].put.requestBody.content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/UpdateUserBody',
    });
    expect(spec.paths['/api/users'].post.responses['400'].content['application/json'].example).toEqual({ message: 'name and email are required' });
  });
});
