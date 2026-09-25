/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import { AnalyzedType, PropertyInfo } from './DtoAnalyzer';
import { Fake } from './Fake';

export class MockGenerator {
  /**
   * Generates mock data based on the analyzed type
   * @param analyzedType The analyzed type information
   * @returns Mock data object
   */
  static generateMock(analyzedType: AnalyzedType): any {
    if (analyzedType.isArray) {
      // Generate array of mocks
      const count = Fake.int(1, 5);
      return Array.from({ length: count }, () => this.generateMock({ ...analyzedType, isArray: false }));
    }

    if (analyzedType.enumValues && analyzedType.enumValues.length > 0) {
      return Fake.arrayElement(analyzedType.enumValues);
    }

    if (analyzedType.unionTypes) {
      // Pick a random union type
      const randomType = Fake.arrayElement(analyzedType.unionTypes);
      return this.generateMockForType(randomType);
    }

    if (analyzedType.properties) {
      // Generate object with properties
      const obj: any = {};
      for (const prop of analyzedType.properties) {
        if (!prop.type.isOptional || Fake.boolean()) {
          obj[prop.name] = this.generateMockForProperty(prop);
        }
      }
      return obj;
    }

    // Generate based on type string
    return this.generateMockForType(analyzedType.type);
  }

  private static generateMockForType(type: string): any {
    const lowerType = type.toLowerCase();

    if (lowerType.includes('string')) {
      return Fake.words();
    }

    if (lowerType.includes('number') || lowerType.includes('int') || lowerType.includes('float')) {
      return Fake.int(1, 100);
    }

    if (lowerType.includes('boolean')) {
      return Fake.boolean();
    }

    if (lowerType.includes('date')) {
      return Fake.recentDate().toISOString();
    }

    // Smart mocking based on property name patterns
    if (lowerType === 'string') {
      // This would be called with property name context, but for now, generic
      return Fake.word();
    }

    // Default fallback
    return Fake.word();
  }

  /**
   * Generates mock data for a property, using the property name for smarter generation
   * @param property The property info
   * @returns Mock value
   */
  static generateMockForProperty(property: PropertyInfo): any {
    const name = property.name.toLowerCase();
    const type = property.type;

    if (type.isArray) {
      const count = Fake.int(1, 5);
      const itemProperty: PropertyInfo = { ...property, type: { ...type, isArray: false } };
      return Array.from({ length: count }, () => this.generateMockForProperty(itemProperty));
    }

    // Structured types (nested DTOs, enums, unions) are shaped by their type,
    // not by the property name — defer to the structure-aware generator.
    if (type.properties || type.enumValues || type.unionTypes) {
      return this.generateMock(type);
    }

    const hinted = this.generateMockForPropertyName(name, type);
    return hinted !== undefined ? hinted : this.generateMock(type);
  }

  /**
   * Name-based hints for scalar properties. Returns `undefined` when no hint
   * applies so the caller can fall back to type-based generation.
   */
  private static generateMockForPropertyName(name: string, type: AnalyzedType): any {
    const typeStr = type.type.toLowerCase();
    const isString = typeStr.includes('string');
    const isNumber = typeStr.includes('number') || typeStr.includes('int') || typeStr.includes('float');

    if (isNumber) {
      if (name.includes('age')) return Fake.int(18, 80);
      if (name.includes('id')) return Fake.int(1, 1000);
      return undefined;
    }

    if (!isString) return undefined;

    if (name.includes('email')) return Fake.email();
    if (name.includes('phone') || name.includes('mobile') || name.includes('tel')) return Fake.phone();
    if (name.includes('address') || name.includes('street')) return Fake.streetAddress();
    if (name.includes('city')) return Fake.city();
    if (name.includes('country')) return Fake.country();
    if (name.includes('url') || name.includes('website')) return Fake.url();
    if (name.includes('date') || name.includes('created') || name.includes('updated')) return Fake.recentDate().toISOString();
    if (name.includes('description') || name.includes('bio')) return Fake.sentences();
    if (name.includes('title')) return Fake.words(3);
    if (name.includes('name')) return Fake.fullName();

    return undefined;
  }
}