/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import { ControllerInfo } from '../src/scanner/ScannerService';
import { OpenApiTransformer } from '../src/utils/OpenApiTransformer';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

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

const buildController = (overrides: Partial<ControllerInfo> = {}): ControllerInfo => ({
  name: 'UsersController',
  path: 'users',
  methods: [],
  ...overrides,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('OpenApiTransformer', () => {
  let transformer: OpenApiTransformer;

  beforeEach(() => {
    transformer = new OpenApiTransformer('http://localhost:3000');
  });

  // ── Top-level spec ────────────────────────────────────────────────────────

  describe('spec structure', () => {
    it('returns openapi 3.0.0', () => {
      const spec = transformer.transform([], 'Test API', '1.0.0', 'http://localhost:3000');
      expect(spec.openapi).toBe('3.0.0');
    });

    it('sets title and version from arguments', () => {
      const spec = transformer.transform([], 'My API', '2.5.0', 'http://localhost:3000');
      expect(spec.info.title).toBe('My API');
      expect(spec.info.version).toBe('2.5.0');
    });

    it('sets the server URL', () => {
      const spec = transformer.transform([], 'API', '1.0.0', 'https://api.example.com');
      expect(spec.servers[0].url).toBe('https://api.example.com');
    });

    it('includes bearerAuth security scheme', () => {
      const spec = transformer.transform([], 'API', '1.0.0', 'http://localhost:3000');
      expect(spec.components.securitySchemes).toHaveProperty('bearerAuth');
    });
  });

  // ── Tags ──────────────────────────────────────────────────────────────────

  describe('tags', () => {
    it('creates one tag per controller', () => {
      const controllers = [
        buildController({ name: 'UsersController', path: 'users' }),
        buildController({ name: 'OrdersController', path: 'orders' }),
      ];
      const spec = transformer.transform(controllers, 'API', '1.0.0', 'http://localhost:3000');
      expect(spec.tags).toHaveLength(2);
    });
  });

  // ── Path building ─────────────────────────────────────────────────────────

  describe('path building', () => {
    it('builds a simple path', () => {
      const controller = buildController({
        methods: [{ name: 'findAll', httpMethod: 'get', route: '', parameters: [], returnType: stringType }],
      });
      const spec = transformer.transform([controller], 'API', '1.0.0', 'http://localhost:3000');
      expect(spec.paths).toHaveProperty('/users');
    });

    it('normalises :id to {id} in paths', () => {
      const controller = buildController({
        methods: [
          {
            name: 'findOne',
            httpMethod: 'get',
            route: ':id',
            parameters: [{ name: 'id', type: numberType, decorator: 'Param', parameterLocation: 'path' }],
            returnType: userDtoType,
          },
        ],
      });
      const spec = transformer.transform([controller], 'API', '1.0.0', 'http://localhost:3000');
      expect(spec.paths).toHaveProperty('/users/{id}');
      expect(spec.paths).not.toHaveProperty('/users/:id');
    });

    it('prepends version when controller has a version', () => {
      const controller = buildController({
        version: '1',
        methods: [{ name: 'findAll', httpMethod: 'get', route: '', parameters: [], returnType: stringType }],
      });
      const spec = transformer.transform([controller], 'API', '1.0.0', 'http://localhost:3000');
      expect(spec.paths).toHaveProperty('/v1/users');
    });
  });

  // ── HTTP methods ──────────────────────────────────────────────────────────

  describe('HTTP method mapping', () => {
    const methods = ['get', 'post', 'put', 'patch', 'delete'] as const;

    methods.forEach(httpMethod => {
      it(`maps ${httpMethod.toUpperCase()} correctly`, () => {
        const controller = buildController({
          methods: [{ name: 'op', httpMethod, route: '', parameters: [], returnType: stringType }],
        });
        const spec = transformer.transform([controller], 'API', '1.0.0', 'http://localhost:3000');
        expect(spec.paths['/users']).toHaveProperty(httpMethod);
      });
    });
  });

  // ── Parameters ────────────────────────────────────────────────────────────

  describe('parameters', () => {
    it('emits a path parameter', () => {
      const controller = buildController({
        methods: [
          {
            name: 'findOne',
            httpMethod: 'get',
            route: ':id',
            parameters: [{ name: 'id', type: numberType, decorator: 'Param', parameterLocation: 'path' }],
            returnType: stringType,
          },
        ],
      });
      const spec = transformer.transform([controller], 'API', '1.0.0', 'http://localhost:3000');
      const op = spec.paths['/users/{id}'].get;
      expect(op.parameters.some((p: any) => p.in === 'path' && p.name === 'id')).toBe(true);
    });

    it('emits a query parameter', () => {
      const controller = buildController({
        methods: [
          {
            name: 'search',
            httpMethod: 'get',
            route: 'search',
            parameters: [{ name: 'q', type: stringType, decorator: 'Query', parameterLocation: 'query' }],
            returnType: stringType,
          },
        ],
      });
      const spec = transformer.transform([controller], 'API', '1.0.0', 'http://localhost:3000');
      const op = spec.paths['/users/search'].get;
      expect(op.parameters.some((p: any) => p.in === 'query' && p.name === 'q')).toBe(true);
    });
  });

  // ── Request body ──────────────────────────────────────────────────────────

  describe('request body', () => {
    it('emits a requestBody for POST with @Body', () => {
      const controller = buildController({
        methods: [
          {
            name: 'create',
            httpMethod: 'post',
            route: '',
            parameters: [{ name: 'dto', type: userDtoType, decorator: 'Body', parameterLocation: 'body' }],
            returnType: userDtoType,
          },
        ],
      });
      const spec = transformer.transform([controller], 'API', '1.0.0', 'http://localhost:3000');
      const op = spec.paths['/users'].post;
      expect(op.requestBody).toBeDefined();
      expect(op.requestBody.content).toHaveProperty('application/json');
    });
  });

  // ── Schema generation ─────────────────────────────────────────────────────

  describe('schema components', () => {
    it('adds schemas to components for referenced DTOs', () => {
      const controller = buildController({
        methods: [
          {
            name: 'getUser',
            httpMethod: 'get',
            route: ':id',
            parameters: [],
            returnType: userDtoType,
          },
        ],
      });
      const spec = transformer.transform([controller], 'API', '1.0.0', 'http://localhost:3000');
      expect(spec.components.schemas).toHaveProperty('UserDto');
    });
  });
});
