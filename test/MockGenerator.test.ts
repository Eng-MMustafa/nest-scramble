/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import { AnalyzedType, PropertyInfo } from '../src/utils/DtoAnalyzer';
import { MockGenerator } from '../src/utils/MockGenerator';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const simpleType = (type: string, isOptional = false): AnalyzedType => ({
  type,
  isArray: false,
  isOptional,
});

const arrayType = (type: string): AnalyzedType => ({ type, isArray: true, isOptional: false });

const objectType = (properties: PropertyInfo[]): AnalyzedType => ({
  type: 'object',
  isArray: false,
  isOptional: false,
  properties,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MockGenerator', () => {

  // ── Primitive types ───────────────────────────────────────────────────────

  describe('generateMock — primitives', () => {
    it('returns a string for type string', () => {
      const result = MockGenerator.generateMock(simpleType('string'));
      expect(typeof result).toBe('string');
    });

    it('returns a number for type number', () => {
      const result = MockGenerator.generateMock(simpleType('number'));
      expect(typeof result).toBe('number');
    });

    it('returns a boolean for type boolean', () => {
      const result = MockGenerator.generateMock(simpleType('boolean'));
      expect(typeof result).toBe('boolean');
    });

    it('returns an ISO date string for type Date', () => {
      const result = MockGenerator.generateMock(simpleType('Date'));
      // Should be a date ISO string
      expect(typeof result).toBe('string');
      expect(() => new Date(result)).not.toThrow();
    });
  });

  // ── Arrays ────────────────────────────────────────────────────────────────

  describe('generateMock — arrays', () => {
    it('returns an array for array types', () => {
      const result = MockGenerator.generateMock(arrayType('string'));
      expect(Array.isArray(result)).toBe(true);
    });

    it('array has at least 1 element', () => {
      const result = MockGenerator.generateMock(arrayType('number'));
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('array elements are of the expected primitive type', () => {
      const result = MockGenerator.generateMock(arrayType('number'));
      result.forEach((el: unknown) => expect(typeof el).toBe('number'));
    });
  });

  // ── Objects ───────────────────────────────────────────────────────────────

  describe('generateMock — objects', () => {
    it('returns an object when properties are present', () => {
      const type = objectType([
        { name: 'id', type: simpleType('number') },
        { name: 'name', type: simpleType('string') },
      ]);
      const result = MockGenerator.generateMock(type);
      expect(typeof result).toBe('object');
      expect(result).not.toBeNull();
    });

    it('includes required properties', () => {
      const type = objectType([
        { name: 'id', type: simpleType('number') },
        { name: 'name', type: simpleType('string') },
      ]);
      const result = MockGenerator.generateMock(type);
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('name');
    });
  });

  // ── Union types ───────────────────────────────────────────────────────────

  describe('generateMock — union types', () => {
    it('returns a value that matches one of the union members', () => {
      const type: AnalyzedType = {
        type: 'string | number',
        isArray: false,
        isOptional: false,
        unionTypes: ['string', 'number'],
      };
      // Run multiple times to reduce flakiness
      for (let i = 0; i < 10; i++) {
        const result = MockGenerator.generateMock(type);
        expect(['string', 'number']).toContain(typeof result);
      }
    });
  });

  // ── Enums ─────────────────────────────────────────────────────────────────

  describe('generateMock — enums', () => {
    it('picks one of the declared enum values', () => {
      const type: AnalyzedType = {
        type: 'ProductStatus',
        isArray: false,
        isOptional: false,
        enumValues: ['active', 'inactive', 'out_of_stock'],
      };
      for (let i = 0; i < 10; i++) {
        expect(type.enumValues).toContain(MockGenerator.generateMock(type));
      }
    });
  });

  // ── Name hints flow through generateMock (mock server path) ───────────────

  describe('generateMock — property names drive scalar hints', () => {
    const dto = objectType([
      { name: 'id', type: simpleType('number') },
      { name: 'email', type: simpleType('string') },
      { name: 'emailVerified', type: simpleType('boolean') },
      { name: 'age', type: simpleType('number') },
      { name: 'status', type: { ...simpleType('Status'), enumValues: ['on', 'off'] } },
      {
        name: 'addresses',
        type: {
          type: 'AddressDto',
          isArray: true,
          isOptional: false,
          properties: [
            { name: 'street', type: simpleType('string') },
            { name: 'city', type: simpleType('string') },
          ],
        },
      },
    ]);

    it('uses the email hint for nested "email" properties', () => {
      expect(MockGenerator.generateMock(dto).email).toMatch(/@/);
    });

    it('keeps non-string types intact even when the name matches a string hint', () => {
      expect(typeof MockGenerator.generateMock(dto).emailVerified).toBe('boolean');
    });

    it('constrains numeric hints to sensible ranges', () => {
      const result = MockGenerator.generateMock(dto);
      expect(result.age).toBeGreaterThanOrEqual(18);
      expect(result.age).toBeLessThanOrEqual(80);
      expect(result.id).toBeGreaterThanOrEqual(1);
    });

    it('resolves enums and nested DTO arrays structurally, not by name', () => {
      const result = MockGenerator.generateMock(dto);
      expect(['on', 'off']).toContain(result.status);
      expect(Array.isArray(result.addresses)).toBe(true);
      for (const address of result.addresses) {
        expect(typeof address).toBe('object');
        expect(typeof address.street).toBe('string');
        expect(typeof address.city).toBe('string');
      }
    });
  });

  // ── Property-aware mocking ────────────────────────────────────────────────

  describe('generateMockForProperty — smart field names', () => {
    const makeProperty = (name: string, type = 'string'): PropertyInfo => ({
      name,
      type: simpleType(type),
    });

    it('generates an email for "email" field', () => {
      const result = MockGenerator.generateMockForProperty(makeProperty('email'));
      expect(result).toMatch(/@/);
    });

    it('generates a full name for "name" field', () => {
      const result = MockGenerator.generateMockForProperty(makeProperty('name'));
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('generates a phone number for "phone" field', () => {
      const result = MockGenerator.generateMockForProperty(makeProperty('phone'));
      expect(typeof result).toBe('string');
    });

    it('generates a URL for "url" field', () => {
      const result = MockGenerator.generateMockForProperty(makeProperty('url'));
      expect(result).toMatch(/^https?:\/\//);
    });

    it('generates a numeric id for "id" number field', () => {
      const result = MockGenerator.generateMockForProperty(makeProperty('id', 'number'));
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThan(0);
    });

    it('generates an ISO date string for "createdAt" field', () => {
      const result = MockGenerator.generateMockForProperty(makeProperty('createdAt'));
      expect(typeof result).toBe('string');
      expect(() => new Date(result)).not.toThrow();
    });

    it('generates a description text for "description" field', () => {
      const result = MockGenerator.generateMockForProperty(makeProperty('description'));
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
