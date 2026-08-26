/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import * as ts from 'typescript';
import {
  getDecoratorArguments,
  getDecoratorName,
  getDecorators,
  objectPropertyInitializer,
} from '../analysis/AstHelpers';

/**
 * A `multipart/form-data` field that carries a file.
 *
 * The field name is **not** available on `@UploadedFile()`; that decorator only
 * receives pipes. The name lives in the interceptor
 * (`FileInterceptor('avatar')`), so reading the parameter alone would document a
 * field name that does not exist.
 */
export interface FileFieldInfo {
  /** Form field name, as declared in the interceptor. */
  name: string;
  /** `true` when the field accepts several files. */
  multiple: boolean;
  /** Upper bound from the interceptor, when it declares one. */
  maxCount?: number;
}

/** Default field name used when the interceptor does not name one. */
const FALLBACK_FIELD = 'file';

/** Reads a string literal argument. */
function stringArg(args: readonly ts.Expression[], index: number): string | undefined {
  const arg = args[index];
  return arg && ts.isStringLiteral(arg) ? arg.text : undefined;
}

/** Reads a numeric literal argument. */
function numberArg(args: readonly ts.Expression[], index: number): number | undefined {
  const arg = args[index];
  return arg && ts.isNumericLiteral(arg) ? Number(arg.text) : undefined;
}

/**
 * Parses `FileFieldsInterceptor([{ name: 'avatar', maxCount: 1 }, ...])`.
 */
function parseFileFieldsArray(args: readonly ts.Expression[]): FileFieldInfo[] {
  const arg = args[0];
  if (!arg || !ts.isArrayLiteralExpression(arg)) return [];

  const fields: FileFieldInfo[] = [];

  for (const element of arg.elements) {
    if (!ts.isObjectLiteralExpression(element)) continue;

    const nameInit = objectPropertyInitializer(element, 'name');
    if (!nameInit || !ts.isStringLiteral(nameInit)) continue;

    const maxInit = objectPropertyInitializer(element, 'maxCount');
    const maxCount = maxInit && ts.isNumericLiteral(maxInit) ? Number(maxInit.text) : undefined;

    fields.push({
      name: nameInit.text,
      // A field declared with maxCount > 1 accepts an array of files.
      multiple: maxCount === undefined ? false : maxCount > 1,
      maxCount,
    });
  }

  return fields;
}

/** Maps one interceptor call to the file fields it declares. */
function fieldsFromInterceptor(name: string, args: readonly ts.Expression[]): FileFieldInfo[] {
  switch (name) {
    case 'FileInterceptor':
      return [{ name: stringArg(args, 0) ?? FALLBACK_FIELD, multiple: false }];

    case 'FilesInterceptor':
      return [
        {
          name: stringArg(args, 0) ?? FALLBACK_FIELD,
          multiple: true,
          maxCount: numberArg(args, 1),
        },
      ];

    case 'FileFieldsInterceptor':
      return parseFileFieldsArray(args);

    case 'AnyFilesInterceptor':
      // The field names are unknown at compile time; document a generic array.
      return [{ name: 'files', multiple: true }];

    default:
      return [];
  }
}

/**
 * Extracts every file field declared by the `@UseInterceptors()` decorators on a
 * method.
 *
 * Only method-level interceptors are read: a class-level file interceptor would
 * apply the same upload field to every route on the controller, which is not a
 * shape NestJS applications use in practice.
 */
export function extractFileFields(method: ts.MethodDeclaration): FileFieldInfo[] {
  const fields: FileFieldInfo[] = [];

  for (const decorator of getDecorators(method)) {
    if (getDecoratorName(decorator) !== 'UseInterceptors') continue;

    for (const arg of getDecoratorArguments(decorator)) {
      if (!ts.isCallExpression(arg)) continue;

      const callee = arg.expression;
      if (!ts.isIdentifier(callee)) continue;

      fields.push(...fieldsFromInterceptor(callee.text, arg.arguments));
    }
  }

  // Two interceptors may name the same field; keep the first declaration.
  const unique = new Map<string, FileFieldInfo>();
  for (const field of fields) {
    if (!unique.has(field.name)) {
      unique.set(field.name, field);
    }
  }

  return [...unique.values()];
}

/** Field used when a method takes an upload but names no field. */
export function fallbackFileField(multiple: boolean): FileFieldInfo {
  return { name: multiple ? 'files' : FALLBACK_FIELD, multiple };
}
