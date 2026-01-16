/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import { ClassDeclaration, InterfaceDeclaration, Node, Type } from 'ts-morph';

export interface AnalyzedType {
  type: string;
  isArray: boolean;
  isOptional: boolean;
  properties?: PropertyInfo[];
  unionTypes?: string[];
}

export interface PropertyInfo {
  name: string;
  type: AnalyzedType;
  description?: string;
}

export class DtoAnalyzer {
  private visited = new Set<string>();

  /**
   * Analyzes a TypeScript type and returns detailed information
   * @param type The TypeScript type to analyze
   * @param isOptional Whether the type is optional
   * @returns AnalyzedType with full type information
   */
  analyzeType(type: Type, isOptional = false): AnalyzedType {
    const typeText = type.getText();

    // Prevent circular references
    if (this.visited.has(typeText)) {
      return {
        type: typeText,
        isArray: false,
        isOptional,
      };
    }

    this.visited.add(typeText);

    try {
      const symbol = type.getSymbol();

      // Check if it's an array
      const arrayElementType = type.getArrayElementType();
      if (arrayElementType) {
        const elementAnalysis = this.analyzeType(arrayElementType);
        return {
          type: typeText,
          isArray: true,
          isOptional,
          properties: elementAnalysis.properties,
        };
      }

      // Check if it's a union type
      const unionTypes = type.getUnionTypes();
      if (unionTypes.length > 1) {
        return {
          type: typeText,
          isArray: false,
          isOptional,
          unionTypes: unionTypes.map(t => t.getText()),
        };
      }

      // Check if it's a class or interface
      if (symbol) {
        const declarations = symbol.getDeclarations();
        for (const decl of declarations) {
          if (Node.isClassDeclaration(decl) || Node.isInterfaceDeclaration(decl)) {
            const properties = this.extractProperties(decl);
            return {
              type: typeText,
              isArray: false,
              isOptional,
              properties,
            };
          }
        }
      }

      // Primitive or other types
      return {
        type: typeText,
        isArray: false,
        isOptional,
      };
    } finally {
      this.visited.delete(typeText);
    }
  }

  private extractProperties(decl: ClassDeclaration | InterfaceDeclaration): PropertyInfo[] {
    const properties: PropertyInfo[] = [];

    const propDeclarations = decl.getProperties();
    for (const prop of propDeclarations) {
      const name = prop.getName();
      const type = prop.getType();
      const isOptional = prop.hasQuestionToken ? prop.hasQuestionToken() : false;
      const analyzedType = this.analyzeType(type, isOptional);

      // Extract JSDoc description
      const jsDocs = prop.getJsDocs();
      let description: string | undefined;
      if (jsDocs.length > 0) {
        const comment = jsDocs[0].getDescription().trim();
        if (comment) {
          description = comment;
        }
      }

      properties.push({
        name,
        type: analyzedType,
        description,
      });
    }

    return properties;
  }
}