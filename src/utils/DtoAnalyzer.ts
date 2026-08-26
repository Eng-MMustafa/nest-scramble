/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import * as ts from 'typescript';
import { extractValidationConstraints, ValidationConstraints } from './ValidationExtractor';
import { getJsDocInfo } from '../analysis/AstHelpers';

export interface AnalyzedType {
  type: string;
  isArray: boolean;
  isOptional: boolean;
  properties?: PropertyInfo[];
  unionTypes?: string[];
  enumValues?: string[];
}

export interface PropertyInfo {
  name: string;
  type: AnalyzedType;
  description?: string;
  /** Constraints recovered from `class-validator` decorators, when present. */
  validation?: ValidationConstraints;
}

export class DtoAnalyzer {
  private visited = new Set<string>();

  constructor(private readonly checker: ts.TypeChecker) {}

  /**
   * Analyzes a TypeScript type and returns detailed information
   * @param type The TypeScript type to analyze
   * @param isOptional Whether the type is optional
   * @returns AnalyzedType with full type information
   */
  analyzeType(type: ts.Type, isOptional = false): AnalyzedType {
    const typeText = this.typeText(type);

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

      // Unwrap Promise<T> to get T
      if (typeText.startsWith('Promise<') && typeText.endsWith('>')) {
        const typeArgs = this.typeArguments(type);
        if (typeArgs.length > 0) {
          return this.analyzeType(typeArgs[0], isOptional);
        }
      }

      // Check if it's an array
      if (this.checker.isArrayType(type)) {
        const elementType = this.typeArguments(type)[0];
        if (elementType) {
          const elementAnalysis = this.analyzeType(elementType);
          return {
            type: elementAnalysis.type || typeText,
            isArray: true,
            isOptional,
            properties: elementAnalysis.properties,
          };
        }
      }

      // Check if it's an enum
      if (symbol) {
        const declarations = symbol.getDeclarations() ?? [];
        for (const decl of declarations) {
          if (ts.isEnumDeclaration(decl)) {
            const enumValues = decl.members.map(member => {
              const initializer = member.initializer;
              if (initializer && ts.isStringLiteral(initializer)) {
                return initializer.text;
              }
              return member.name.getText();
            });
            return {
              type: decl.name.text || symbol.getName() || typeText,
              isArray: false,
              isOptional,
              enumValues,
            };
          }
        }
      }

      // Check if it's a union type
      const unionTypes = type.isUnion() ? type.types : [];
      if (unionTypes.length > 1) {
        // `prop?: AddressDto` widens to `AddressDto | undefined`. Without
        // stripping the nullish members the DTO name is lost, which produced
        // `oneOf` noise in the OpenAPI schema and untyped client properties.
        const meaningful = unionTypes.filter(
          t => !(t.flags & ts.TypeFlags.Undefined) && !(t.flags & ts.TypeFlags.Null),
        );

        if (meaningful.length === 1) {
          this.visited.delete(typeText);
          return this.analyzeType(meaningful[0], true);
        }

        // Check if it's a string literal union (acts like an enum)
        const literalValues: string[] = [];
        let allLiterals = true;

        for (const unionType of unionTypes) {
          if (unionType.isStringLiteral()) {
            literalValues.push(unionType.value);
          } else {
            allLiterals = false;
            break;
          }
        }

        if (allLiterals && literalValues.length > 0) {
          return {
            type: 'string',
            isArray: false,
            isOptional,
            enumValues: literalValues,
          };
        }

        return {
          type: typeText,
          isArray: false,
          isOptional,
          unionTypes: unionTypes.map(t => this.typeText(t)),
        };
      }

      // Check if it's a class or interface
      if (symbol) {
        const declarations = symbol.getDeclarations() ?? [];
        for (const decl of declarations) {
          if (ts.isClassDeclaration(decl) || ts.isInterfaceDeclaration(decl)) {
            const properties = this.extractProperties(decl);
            // Use the class/interface name instead of full type text
            const className = decl.name?.text || symbol.getName() || typeText;
            return {
              type: className,
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

  /** The type of a node, resolved through the checker. */
  typeOf(node: ts.Node): ts.Type {
    return this.checker.getTypeAtLocation(node);
  }

  /** The return type of a method, resolved through its signature. */
  returnTypeOf(method: ts.SignatureDeclaration): ts.Type {
    const signature = this.checker.getSignatureFromDeclaration(method);
    return signature
      ? this.checker.getReturnTypeOfSignature(signature)
      : this.checker.getTypeAtLocation(method);
  }

  private typeText(type: ts.Type): string {
    return this.checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation);
  }

  private typeArguments(type: ts.Type): readonly ts.Type[] {
    if (!(type.flags & ts.TypeFlags.Object)) return [];
    const objectType = type as ts.ObjectType;
    if (!(objectType.objectFlags & ts.ObjectFlags.Reference)) return [];
    return this.checker.getTypeArguments(type as ts.TypeReference);
  }

  private extractProperties(decl: ts.ClassDeclaration | ts.InterfaceDeclaration): PropertyInfo[] {
    const properties: PropertyInfo[] = [];

    for (const member of decl.members) {
      if (!ts.isPropertyDeclaration(member) && !ts.isPropertySignature(member)) {
        continue;
      }

      const name = member.name.getText();
      const type = this.checker.getTypeAtLocation(member);

      // Interface members have no decorators; only class properties do.
      const validation = ts.isPropertyDeclaration(member)
        ? extractValidationConstraints(member)
        : undefined;

      // `@IsOptional()` and `@IsNotEmpty()` override the `?` marker, because the
      // validation pipe, not the TypeScript type, decides what the API accepts.
      let isOptional = member.questionToken !== undefined;
      if (validation?.explicitlyOptional) {
        isOptional = true;
      } else if (validation?.explicitlyRequired) {
        isOptional = false;
      }

      const analyzedType = this.analyzeType(type, isOptional);

      // The union-stripping branch re-derives `isOptional`, so re-assert the
      // decorator-driven decision afterwards.
      analyzedType.isOptional = isOptional;

      // Extract JSDoc description
      const description = getJsDocInfo(member).description;

      properties.push({
        name,
        type: analyzedType,
        description,
        validation,
      });
    }

    return properties;
  }
}