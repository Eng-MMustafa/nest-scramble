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
          obj[prop.name] = this.generateMock(prop.type);
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

    if (property.type.isArray) {
      const count = Fake.int(1, 5);
      return Array.from({ length: count }, () => this.generateMockForPropertyName(name, { ...property.type, isArray: false }));
    }

    if (property.type.properties) {
      const obj: any = {};
      for (const prop of property.type.properties) {
        if (!prop.type.isOptional || Fake.boolean()) {
          obj[prop.name] = this.generateMockForProperty(prop);
        }
      }
      return obj;
    }

    return this.generateMockForPropertyName(name, property.type);
  }

  private static generateMockForPropertyName(name: string, type: AnalyzedType): any {
    const typeStr = type.type.toLowerCase();

    // Email
    if (name.includes('email')) {
      return Fake.email();
    }

    // Name
    if (name.includes('name') || name.includes('firstname') || name.includes('lastname')) {
      return Fake.fullName();
    }

    // Phone
    if (name.includes('phone') || name.includes('mobile') || name.includes('tel')) {
      return Fake.phone();
    }

    // Address
    if (name.includes('address') || name.includes('street')) {
      return Fake.streetAddress();
    }

    // City
    if (name.includes('city')) {
      return Fake.city();
    }

    // Country
    if (name.includes('country')) {
      return Fake.country();
    }

    // URL
    if (name.includes('url') || name.includes('website')) {
      return Fake.url();
    }

    // ID
    if (name.includes('id') && typeStr.includes('number')) {
      return Fake.int(1, 1000);
    }

    // Age
    if (name.includes('age') && typeStr.includes('number')) {
      return Fake.int(18, 80);
    }

    // Date
    if (name.includes('date') || name.includes('created') || name.includes('updated')) {
      return Fake.recentDate().toISOString();
    }

    // Description
    if (name.includes('description') || name.includes('bio')) {
      return Fake.sentences();
    }

    // Title
    if (name.includes('title')) {
      return Fake.words(3);
    }

    // Fallback to type-based generation
    return this.generateMockForType(type.type);
  }
}