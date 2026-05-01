/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import { PostmanCollectionGenerator } from '../src/generators/PostmanCollectionGenerator';
import { ControllerInfo } from '../src/scanner/ScannerService';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const stringType = { type: 'string', isArray: false, isOptional: false };
const numberType = { type: 'number', isArray: false, isOptional: false };
const userDtoType = {
  type: 'UserDto',
  isArray: false,
  isOptional: false,
  properties: [
    { name: 'id', type: numberType },
    { name: 'name', type: stringType },
  ],
};

const usersController: ControllerInfo = {
  name: 'UsersController',
  path: 'users',
  methods: [
    {
      name: 'findAll',
      httpMethod: 'GET',
      route: '',
      parameters: [],
      returnType: { type: 'UserDto', isArray: true, isOptional: false },
    },
    {
      name: 'findOne',
      httpMethod: 'GET',
      route: ':id',
      parameters: [{ name: 'id', type: numberType, decorator: 'Param', parameterLocation: 'path' }],
      returnType: userDtoType,
    },
    {
      name: 'create',
      httpMethod: 'POST',
      route: '',
      parameters: [{ name: 'dto', type: userDtoType, decorator: '@Body()', parameterLocation: 'body' }],
      returnType: userDtoType,
    },
    {
      name: 'remove',
      httpMethod: 'DELETE',
      route: ':id',
      parameters: [{ name: 'id', type: numberType, decorator: 'Param', parameterLocation: 'path' }],
      returnType: { type: 'void', isArray: false, isOptional: false },
    },
  ],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PostmanCollectionGenerator', () => {
  let gen: PostmanCollectionGenerator;

  beforeEach(() => {
    gen = new PostmanCollectionGenerator('http://localhost:3000');
  });

  // ── Collection structure ──────────────────────────────────────────────────

  describe('collection structure', () => {
    it('returns an object with info, item and variable fields', () => {
      const col = gen.generateCollection([usersController]);
      expect(col).toHaveProperty('info');
      expect(col).toHaveProperty('item');
      expect(col).toHaveProperty('variable');
    });

    it('sets the collection name', () => {
      const col = gen.generateCollection([usersController], 'My API');
      expect(col.info.name).toBe('My API');
    });

    it('uses the Postman v2.1 schema URL', () => {
      const col = gen.generateCollection([usersController]);
      expect(col.info.schema).toContain('v2.1.0');
    });

    it('includes a baseUrl variable', () => {
      const col = gen.generateCollection([usersController]);
      const baseUrlVar = col.variable?.find(v => v.key === 'baseUrl');
      expect(baseUrlVar).toBeDefined();
    });
  });

  // ── Folders ───────────────────────────────────────────────────────────────

  describe('controller folders', () => {
    it('creates one folder per controller', () => {
      const col = gen.generateCollection([
        usersController,
        { name: 'OrdersController', path: 'orders', methods: [] },
      ]);
      expect(col.item).toHaveLength(2);
    });

    it('names the folder after the controller', () => {
      const col = gen.generateCollection([usersController]);
      expect(col.item[0].name).toBe('UsersController');
    });

    it('contains one request per controller method', () => {
      const col = gen.generateCollection([usersController]);
      expect(col.item[0].item).toHaveLength(4);
    });
  });

  // ── Request details ───────────────────────────────────────────────────────

  describe('individual requests', () => {
    it('sets the correct HTTP method on each request', () => {
      const col = gen.generateCollection([usersController]);
      const requests = col.item[0].item!;
      const methods = requests.map(r => r.request?.method);
      expect(methods).toContain('GET');
      expect(methods).toContain('POST');
      expect(methods).toContain('DELETE');
    });

    it('includes Content-Type header on all requests', () => {
      const col = gen.generateCollection([usersController]);
      for (const req of col.item[0].item!) {
        const ctHeader = req.request?.header.find(h => h.key === 'Content-Type');
        expect(ctHeader).toBeDefined();
      }
    });

    it('adds a body for @Body() parameters', () => {
      const col = gen.generateCollection([usersController]);
      const createReq = col.item[0].item!.find(r => r.name?.includes('create'));
      expect(createReq?.request?.body).toBeDefined();
      expect(createReq?.request?.body?.mode).toBe('raw');
    });

    it('does not add a body for GET requests', () => {
      const col = gen.generateCollection([usersController]);
      const findAllReq = col.item[0].item!.find(r => r.name?.toLowerCase().includes('findall'));
      expect(findAllReq?.request?.body).toBeUndefined();
    });
  });

  // ── Empty controller ──────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles empty method list gracefully', () => {
      const empty: ControllerInfo = { name: 'EmptyController', path: 'empty', methods: [] };
      const col = gen.generateCollection([empty]);
      expect(col.item[0].item).toHaveLength(0);
    });

    it('handles empty controller list', () => {
      const col = gen.generateCollection([]);
      expect(col.item).toHaveLength(0);
    });
  });
});
