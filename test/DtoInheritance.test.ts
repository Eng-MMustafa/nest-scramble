/**
 * Tests for DTO inheritance and mapped-type resolution.
 *
 * Before v5.3.0 the analyzer read only a class declaration's own members, so
 * `extends BaseDto` silently dropped every inherited property, and the
 * `@nestjs/mapped-types` helpers (`PartialType`, `PickType`, `OmitType`,
 * `IntersectionType`) — the standard way to write Update DTOs — produced empty
 * schemas.
 */
import { AnalyzedType, PropertyInfo } from '../src/utils/DtoAnalyzer';
import { ControllerInfo, MethodInfo, ScannerService } from '../src/scanner/ScannerService';
import { ScrambleLogger } from '../src/utils/ScrambleLogger';

const FIXTURE_SOURCE = 'test/fixtures/inheritance-app';

describe('DTO inheritance and mapped types', () => {
  jest.setTimeout(120_000);

  let controller: ControllerInfo;

  const method = (name: string): MethodInfo => {
    const found = controller.methods.find((m) => m.name === name);
    if (!found) throw new Error(`Fixture method "${name}" not found`);
    return found;
  };

  const bodyType = (methodName: string): AnalyzedType => {
    const body = method(methodName).parameters.find((p) => p.parameterLocation === 'body');
    if (!body) throw new Error(`Fixture method "${methodName}" has no body parameter`);
    return body.type;
  };

  const prop = (type: AnalyzedType, name: string): PropertyInfo => {
    const found = type.properties?.find((p) => p.name === name);
    if (!found) throw new Error(`Property "${name}" not found on ${type.type}`);
    return found;
  };

  const names = (type: AnalyzedType): string[] =>
    (type.properties ?? []).map((p) => p.name).sort();

  beforeAll(() => {
    ScrambleLogger.configure('silent');
    const controllers = new ScannerService().scanControllers(FIXTURE_SOURCE);
    controller = controllers.find((c) => c.name === 'PeopleController')!;
  });

  afterAll(() => {
    ScrambleLogger.configure('info');
  });

  describe('plain class inheritance', () => {
    it('includes inherited properties alongside own properties', () => {
      expect(names(bodyType('create'))).toEqual(
        ['createdAt', 'email', 'id', 'name', 'nickname'].sort(),
      );
    });

    it('keeps validation constraints on own properties', () => {
      expect(prop(bodyType('create'), 'name').validation?.maxLength).toBe(80);
    });

    it('keeps JSDoc descriptions on inherited properties', () => {
      expect(prop(bodyType('create'), 'id').description).toBe('Unique identifier.');
    });

    it('keeps decorator-driven required/optional semantics', () => {
      const type = bodyType('create');
      expect(prop(type, 'name').type.isOptional).toBe(false);
      expect(prop(type, 'nickname').type.isOptional).toBe(true);
    });
  });

  describe('PartialType', () => {
    it('resolves every property of the source DTO', () => {
      expect(names(bodyType('update'))).toEqual(
        ['createdAt', 'email', 'id', 'name', 'nickname'].sort(),
      );
    });

    it('marks every property optional, overriding inherited @IsNotEmpty', () => {
      for (const p of bodyType('update').properties!) {
        expect(p.type.isOptional).toBe(true);
      }
    });

    it('keeps validation constraints from the source DTO', () => {
      expect(prop(bodyType('update'), 'name').validation?.maxLength).toBe(80);
      expect(prop(bodyType('update'), 'email').validation?.format).toBe('email');
    });
  });

  describe('PickType', () => {
    it('resolves only the picked properties plus own members', () => {
      expect(names(bodyType('login'))).toEqual(['email', 'password']);
    });

    it('keeps picked properties required', () => {
      expect(prop(bodyType('login'), 'email').type.isOptional).toBe(false);
    });
  });

  describe('OmitType', () => {
    it('drops the omitted property and keeps the rest', () => {
      const returnType = method('getPublic').returnType;
      expect(names(returnType)).toEqual(['createdAt', 'id', 'name', 'nickname'].sort());
    });
  });

  describe('IntersectionType', () => {
    it('merges properties from both source DTOs', () => {
      const type = bodyType('withTags');
      expect(names(type)).toEqual(
        ['createdAt', 'email', 'id', 'name', 'nickname', 'tags'].sort(),
      );
      expect(prop(type, 'tags').type.isArray).toBe(true);
    });
  });

  describe('interface inheritance', () => {
    it('includes properties from extended interfaces', () => {
      expect(names(method('create').returnType)).toEqual(['id', 'name', 'updatedAt']);
    });
  });
});
