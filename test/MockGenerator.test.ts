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
