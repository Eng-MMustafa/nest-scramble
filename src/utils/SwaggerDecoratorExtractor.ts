/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import * as ts from 'typescript';
import {
  getDecorators,
  getDecoratorArguments,
  getDecoratorName,
  objectPropertyInitializer,
  stringLiteralValue,
} from '../analysis/AstHelpers';

export interface ApiPropertyMetadata {
  description?: string;
  example?: unknown;
  format?: string;
  enum?: (string | number)[];
  required?: boolean;
  nullable?: boolean;
  /** A Swagger/OpenAPI type hint to use when TypeScript cannot infer anything useful. */
  swaggerType?: string;
}

export interface ApiOperationMetadata {
  summary?: string;
  description?: string;
}

/**
 * Reads `@nestjs/swagger` decorators on a property declaration and turns them
 * into documentation hints. These are *hints*, not overrides: when TypeScript
 * already knows a concrete type we keep it, but when the type is `any`,
 * `Object`, or missing entirely the decorator fills the gap.
 */
export function extractApiPropertyMetadata(node: ts.PropertyDeclaration | ts.PropertySignature): ApiPropertyMetadata | undefined {
  const decorator = getDecorators(node).find((d) => {
    const name = getDecoratorName(d);
    return name === 'ApiProperty' || name === 'ApiPropertyOptional';
  });
  if (!decorator) return undefined;

  const name = getDecoratorName(decorator)!;
  const optional = name === 'ApiPropertyOptional';

  const args = getDecoratorArguments(decorator);
  if (args.length === 0) {
    return optional ? { required: false } : {};
  }

  const options = args[0];
  if (!ts.isObjectLiteralExpression(options)) {
    return optional ? { required: false } : {};
  }

  const meta: ApiPropertyMetadata = {};

  if (optional) {
    meta.required = false;
  }

  const descriptionInit = objectPropertyInitializer(options, 'description');
  if (descriptionInit && ts.isStringLiteral(descriptionInit)) {
    meta.description = descriptionInit.text;
  }

  const exampleInit = objectPropertyInitializer(options, 'example');
  if (exampleInit) {
    meta.example = literalValue(exampleInit);
  }

  const formatInit = objectPropertyInitializer(options, 'format');
  if (formatInit && ts.isStringLiteral(formatInit)) {
    meta.format = formatInit.text;
  }

  const typeInit = objectPropertyInitializer(options, 'type');
  if (typeInit) {
    if (ts.isIdentifier(typeInit) || ts.isPropertyAccessExpression(typeInit)) {
      meta.swaggerType = typeInit.getText().replace(/^([^.]+\.)?/, '');
    } else if (ts.isStringLiteral(typeInit)) {
      meta.swaggerType = typeInit.text;
    }
  }

  const enumInit = objectPropertyInitializer(options, 'enum');
  if (enumInit) {
    meta.enum = readEnumArray(enumInit);
  }

  const requiredInit = objectPropertyInitializer(options, 'required');
  if (requiredInit) {
    meta.required = requiredInit.kind === ts.SyntaxKind.TrueKeyword;
  }

  const nullableInit = objectPropertyInitializer(options, 'nullable');
  if (nullableInit) {
    meta.nullable = nullableInit.kind === ts.SyntaxKind.TrueKeyword;
  }

  return meta;
}

/**
 * Reads `@ApiOperation({ summary, description })` on a method.
 */
export function extractApiOperationMetadata(node: ts.MethodDeclaration): ApiOperationMetadata | undefined {
  const decorator = getDecorators(node).find((d) => getDecoratorName(d) === 'ApiOperation');
  if (!decorator) return undefined;

  const args = getDecoratorArguments(decorator);
  if (args.length === 0 || !ts.isObjectLiteralExpression(args[0])) return undefined;

  const options = args[0];
  const meta: ApiOperationMetadata = {};

  const summaryInit = objectPropertyInitializer(options, 'summary');
  if (summaryInit && ts.isStringLiteral(summaryInit)) {
    meta.summary = summaryInit.text;
  }

  const descriptionInit = objectPropertyInitializer(options, 'description');
  if (descriptionInit && ts.isStringLiteral(descriptionInit)) {
    meta.description = descriptionInit.text;
  }

  return meta;
}

/**
 * Reads `@ApiTags('tag1', 'tag2', ...)` on a class.
 */
export function extractApiTags(node: ts.ClassDeclaration): string[] | undefined {
  const decorator = getDecorators(node).find((d) => getDecoratorName(d) === 'ApiTags');
  if (!decorator) return undefined;

  const args = getDecoratorArguments(decorator);
  const tags: string[] = [];
  for (const arg of args) {
    const value = stringLiteralValue(arg);
    if (value) tags.push(value);
  }
  return tags.length > 0 ? tags : undefined;
}

function literalValue(node: ts.Expression): unknown {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map((el) => literalValue(el));
  }
  if (ts.isObjectLiteralExpression(node)) {
    const obj: Record<string, unknown> = {};
    for (const prop of node.properties) {
      if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
        obj[prop.name.text] = literalValue(prop.initializer);
      }
    }
    return obj;
  }
  return undefined;
}

function readEnumArray(node: ts.Expression): (string | number)[] | undefined {
  if (ts.isArrayLiteralExpression(node)) {
    const values: (string | number)[] = [];
    for (const el of node.elements) {
      if (ts.isStringLiteral(el)) values.push(el.text);
      else if (ts.isNumericLiteral(el)) values.push(Number(el.text));
      else if (ts.isPropertyAccessExpression(el) && ts.isIdentifier(el.name)) {
        values.push(el.name.text);
      }
    }
    return values.length > 0 ? values : undefined;
  }

  // Common pattern: `enum: Object.values(MyEnum)` or `enum: MyEnum`
  if (ts.isPropertyAccessExpression(node)) {
    const enumName = node.expression.getText();
    return [`<values of ${enumName}>`];
  }

  return undefined;
}
