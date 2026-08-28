/**
 * Unit tests for the AST scanner — the core of the library, which shipped at
 * 0% coverage in v3.0.6.
 */
import { ControllerInfo, MethodInfo, ScannerService } from '../src/scanner/ScannerService';
import { ScrambleLogger } from '../src/utils/ScrambleLogger';

const FIXTURE_SOURCE = 'test/fixtures/sample-app';

describe('ScannerService', () => {
  jest.setTimeout(120_000);

  let controllers: ControllerInfo[];
  let usersController: ControllerInfo;

  const findMethod = (name: string): MethodInfo => {
    const method = usersController.methods.find((m) => m.name === name);
    if (!method) throw new Error(`Fixture method "${name}" not found`);
    return method;
  };

  beforeAll(() => {
    ScrambleLogger.configure('silent');
    controllers = new ScannerService().scanControllers(FIXTURE_SOURCE);
    const found = controllers.find((c) => c.name === 'UsersController');
    if (!found) throw new Error('UsersController fixture was not discovered');
    usersController = found;
  });

  afterAll(() => {
    ScrambleLogger.configure('info');
  });

  describe('controller discovery', () => {
    it('finds classes decorated with @Controller', () => {
      expect(controllers.length).toBeGreaterThan(0);
      expect(usersController).toBeDefined();
    });

    it('extracts the controller base path', () => {
      expect(usersController.path).toBe('users');
    });

    it('detects controller-level guards', () => {
      expect(usersController.hasGuards).toBe(true);
      expect(usersController.guardTypes).toContain('JwtAuthGuard');
    });

    it('returns an empty array for a directory with no controllers', () => {
      const result = new ScannerService().scanControllers('test/fixtures/does-not-exist');
      expect(result).toEqual([]);
    });
  });

  describe('HTTP method extraction', () => {
    it.each([
      ['listUsers', 'GET', ''],
      ['getUser', 'GET', ':id'],
      ['createUser', 'POST', ''],
      ['replaceUser', 'PUT', ':id'],
      ['updateUser', 'PATCH', ':id'],
      ['deleteUser', 'DELETE', ':id'],
    ])('maps %s to %s %s', (name, httpMethod, route) => {
      const method = findMethod(name);
      expect(method.httpMethod).toBe(httpMethod);
      expect(method.route).toBe(route);
    });

    it('ignores methods without an HTTP decorator', () => {
      expect(usersController.methods.every((m) => m.httpMethod.length > 0)).toBe(true);
    });
  });

  describe('parameter location detection', () => {
    it('marks @Param arguments as path parameters', () => {
      const param = findMethod('getUser').parameters.find((p) => p.name === 'id');
      expect(param?.parameterLocation).toBe('path');
    });

    it('marks @Query arguments as query parameters', () => {
      const param = findMethod('listUsers').parameters.find((p) => p.name === 'query');
      expect(param?.parameterLocation).toBe('query');
    });

    it('marks @Body arguments as body parameters', () => {
      const param = findMethod('createUser').parameters.find((p) => p.name === 'body');
      expect(param?.parameterLocation).toBe('body');
    });

    it('marks @Headers arguments as header parameters', () => {
      const param = findMethod('deleteUser').parameters.find((p) => p.name === 'requestId');
      expect(param?.parameterLocation).toBe('header');
    });
  });

  describe('return type analysis', () => {
    it('resolves a DTO class return type by name', () => {
      expect(findMethod('getUser').returnType.type).toBe('UserDto');
      expect(findMethod('getUser').returnType.isArray).toBe(false);
    });

    it('detects array return types and keeps the element type', () => {
      const returnType = findMethod('listUsers').returnType;
      expect(returnType.type).toBe('UserDto');
      expect(returnType.isArray).toBe(true);
    });

    it('unwraps Promise<T> return types', () => {
      const returnType = findMethod('updateUser').returnType;
      expect(returnType.type).toBe('UserDto');
      expect(returnType.isArray).toBe(false);
    });

    it('extracts properties from inferred anonymous return types', () => {
      // `getStats()` has no annotation — the envelope shape is inferred from
      // the return statement. It used to be documented as a plain string.
      const returnType = findMethod('getStats').returnType;
      expect(returnType.properties).toBeDefined();

      const names = returnType.properties!.map((p) => p.name).sort();
      expect(names).toEqual(['active', 'items', 'total']);

      const items = returnType.properties!.find((p) => p.name === 'items')!;
      expect(items.type.isArray).toBe(true);
      expect(items.type.type).toBe('UserDto');
    });

    it('resolves the nested DTO properties', () => {
      const properties = findMethod('getUser').returnType.properties;
      expect(properties).toBeDefined();

      const names = properties!.map((p) => p.name);
      expect(names).toEqual(
        expect.arrayContaining(['id', 'email', 'fullName', 'role', 'address', 'tags', 'isActive']),
      );
    });

    it('marks optional DTO properties as optional', () => {
      const properties = findMethod('getUser').returnType.properties!;
      const address = properties.find((p) => p.name === 'address');
      expect(address?.type.isOptional).toBe(true);

      const email = properties.find((p) => p.name === 'email');
      expect(email?.type.isOptional).toBe(false);
    });

    it('extracts enum members from an enum-typed property', () => {
      const properties = findMethod('getUser').returnType.properties!;
      const role = properties.find((p) => p.name === 'role');
      expect(role?.type.enumValues).toEqual(expect.arrayContaining(['admin', 'member']));
    });

    it('extracts JSDoc descriptions from DTO properties', () => {
      const properties = findMethod('getUser').returnType.properties!;
      const email = properties.find((p) => p.name === 'email');
      expect(email?.description).toBe('Primary contact email');
    });

    it('detects primitive array properties', () => {
      const properties = findMethod('getUser').returnType.properties!;
      const tags = properties.find((p) => p.name === 'tags');
      expect(tags?.type.isArray).toBe(true);
      expect(tags?.type.type).toBe('string');
    });
  });

  describe('public route detection', () => {
    it("treats @SetMetadata('isPublic', true) as public", () => {
      expect(findMethod('deleteUser').isPublic).toBe(true);
    });

    it('leaves other methods non-public', () => {
      expect(findMethod('getUser').isPublic).toBe(false);
    });
  });
});
