/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import * as ts from 'typescript';

/**
 * Shared helpers for reading decorators, literals and JSDoc off raw
 * TypeScript AST nodes. These cover the handful of ts-morph conveniences the
 * scanner relied on.
 */

/** The decorators applied to a node, or an empty array. */
export function getDecorators(node: ts.Node): readonly ts.Decorator[] {
  return ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
}

/** The call expression of a decorator written as `@Name(...)`. */
export function getDecoratorCall(decorator: ts.Decorator): ts.CallExpression | undefined {
  return ts.isCallExpression(decorator.expression) ? decorator.expression : undefined;
}

/** The identifier name of a decorator, for both `@Name` and `@Name(...)`. */
export function getDecoratorName(decorator: ts.Decorator): string | undefined {
  const call = getDecoratorCall(decorator);
  const expression = call ? call.expression : decorator.expression;
  return ts.isIdentifier(expression) ? expression.text : undefined;
}

/** The arguments of a decorator call, or an empty array. */
export function getDecoratorArguments(decorator: ts.Decorator): readonly ts.Expression[] {
  return getDecoratorCall(decorator)?.arguments ?? [];
}

/** The numeric value of a literal, handling `-1` prefix expressions. */
export function numericLiteralValue(node: ts.Node): number | undefined {
  if (ts.isNumericLiteral(node)) {
    return Number(node.text);
  }
  if (ts.isPrefixUnaryExpression(node) && ts.isNumericLiteral(node.operand)) {
    const value = Number(node.operand.text);
    return node.operator === ts.SyntaxKind.MinusToken ? -value : value;
  }
  return undefined;
}

/** The value of a string literal node, if it is one. */
export function stringLiteralValue(node: ts.Node): string | undefined {
  return ts.isStringLiteral(node) ? node.text : undefined;
}

/** The initializer of a `name: value` property inside an object literal. */
export function objectPropertyInitializer(
  obj: ts.ObjectLiteralExpression,
  name: string,
): ts.Expression | undefined {
  for (const prop of obj.properties) {
    if (ts.isPropertyAssignment(prop) && prop.name.getText() === name) {
      return prop.initializer;
    }
  }
  return undefined;
}

export interface JsDocInfo {
  /** Full description text, before any tags. */
  description?: string;
  deprecated?: boolean;
}

/** Reads the JSDoc description and `@deprecated` tag off a node. */
export function getJsDocInfo(node: ts.Node): JsDocInfo {
  const jsDocs = ts.getJSDocCommentsAndTags(node).filter(ts.isJSDoc);
  if (jsDocs.length === 0) {
    return {};
  }

  const deprecated = jsDocs.some((doc) =>
    (doc.tags ?? []).some((tag) => tag.tagName.text === 'deprecated'),
  );

  const comment = jsDocs[0].comment;
  const description =
    typeof comment === 'string' ? comment : (ts.getTextOfJSDocComment(comment) ?? '');

  return {
    description: description.trim() || undefined,
    deprecated: deprecated || undefined,
  };
}
