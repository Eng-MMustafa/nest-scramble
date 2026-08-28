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

      // `boolean` is a union of `true | false` at the checker level, and
      // properties widened from object literals surface it that way. Without
      // this check they fell into the union branch and were documented as a
      // two-variant `oneOf` instead of a plain boolean.
      if (typeText === 'boolean') {
        return { type: 'boolean', isArray: false, isOptional };
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
            // Properties come from the resolved *type*, not the declaration's
            // own members: `extends BaseDto`, `extends PartialType(CreateDto)`
            // and interface inheritance all contribute properties that never
            // appear in `decl.members`.
            const properties = this.extractPropertiesOfType(type);
            // Use the class/interface name instead of full type text
            let className = decl.name?.text || symbol.getName() || typeText;

            // An instantiated generic keeps its arguments in the name, so
            // `PaginatedDto<ProductDto>` and `PaginatedDto<UserDto>` stay
            // distinguishable. `typeToString` alone prints just the bare
            // class name for both.
            const typeArgs = this.typeArguments(type);
            if (typeArgs.length > 0 && typeArgs.every(arg => !arg.isTypeParameter())) {
              className = `${className}<${typeArgs.map(arg => this.typeText(arg)).join(', ')}>`;
            }

            return {
              type: className,
              isArray: false,
              isOptional,
              properties,
            };
          }
        }
      }

      // Anonymous object types — inferred returns (`return { total, items }`),
      // type literals and mapped shapes. No named declaration exists, but the
      // checker still knows every property. Without this branch these shapes
      // fell through to the name-based fallback and were documented as strings.
      if (
        type.flags & ts.TypeFlags.Object &&
        type.getCallSignatures().length === 0 &&
        !this.checker.isArrayLikeType(type)
      ) {
        const properties = this.extractPropertiesOfType(type);
        if (properties.length > 0) {
          return {
            type: typeText,
            isArray: false,
            isOptional,
            properties,
          };
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

  private extractPropertiesOfType(type: ts.Type): PropertyInfo[] {
    const properties: PropertyInfo[] = [];

    for (const symbol of this.checker.getPropertiesOfType(type)) {
      // Methods and accessors are not data properties of a DTO.
      if (symbol.flags & (ts.SymbolFlags.Method | ts.SymbolFlags.Accessor)) {
        continue;
      }

      // Mapped types (`PartialType`, `PickType`, ...) synthesize property
      // symbols, but each one still links back to the original declaration —
      // which is where the validation decorators and JSDoc live.
      const decl = (symbol.getDeclarations() ?? []).find(
        (d): d is ts.PropertyDeclaration | ts.PropertySignature =>
          ts.isPropertyDeclaration(d) || ts.isPropertySignature(d),
      );

      const name = symbol.getName();

      // Interface members have no decorators; only class properties do.
      const validation = decl && ts.isPropertyDeclaration(decl)
        ? extractValidationConstraints(decl)
        : undefined;

      // `@IsOptional()` and `@IsNotEmpty()` override the `?` marker, because the
      // validation pipe, not the TypeScript type, decides what the API accepts.
      // The exception is optionality *synthesized* by a mapped type: under
      // `PartialType(CreateDto)` every field really is optional at runtime, so
      // an `@IsNotEmpty()` inherited from the original class must not win.
      const symbolOptional = (symbol.flags & ts.SymbolFlags.Optional) !== 0;
      const declOptional = decl?.questionToken !== undefined;
      const synthesizedOptional = symbolOptional && !declOptional;

      let isOptional = symbolOptional;
      if (!synthesizedOptional) {
        if (validation?.explicitlyOptional) {
          isOptional = true;
        } else if (validation?.explicitlyRequired) {
          isOptional = false;
        }
      }

      const propType = decl
        ? this.checker.getTypeOfSymbolAtLocation(symbol, decl)
        : this.checker.getTypeOfSymbol(symbol);

      const analyzedType = this.analyzeType(propType, isOptional);

      // The union-stripping branch re-derives `isOptional`, so re-assert the
      // decorator-driven decision afterwards.
      analyzedType.isOptional = isOptional;

      // Extract JSDoc description
      const description = decl ? getJsDocInfo(decl).description : undefined;

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