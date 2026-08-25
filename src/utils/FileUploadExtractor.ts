/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import { MethodDeclaration, Node } from 'ts-morph';

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
function stringArg(args: Node[], index: number): string | undefined {
  const arg = args[index];
  return arg && Node.isStringLiteral(arg) ? arg.getLiteralValue() : undefined;
}

/** Reads a numeric literal argument. */
function numberArg(args: Node[], index: number): number | undefined {
  const arg = args[index];
  return arg && Node.isNumericLiteral(arg) ? arg.getLiteralValue() : undefined;
}

/**
 * Parses `FileFieldsInterceptor([{ name: 'avatar', maxCount: 1 }, ...])`.
 */
function parseFileFieldsArray(args: Node[]): FileFieldInfo[] {
  const arg = args[0];
  if (!arg || !Node.isArrayLiteralExpression(arg)) return [];

  const fields: FileFieldInfo[] = [];

  for (const element of arg.getElements()) {
    if (!Node.isObjectLiteralExpression(element)) continue;

    const nameProp = element.getProperty('name');
    if (!nameProp || !Node.isPropertyAssignment(nameProp)) continue;

    const nameInit = nameProp.getInitializer();
    if (!nameInit || !Node.isStringLiteral(nameInit)) continue;

    const maxCountProp = element.getProperty('maxCount');
    let maxCount: number | undefined;

    if (maxCountProp && Node.isPropertyAssignment(maxCountProp)) {
      const maxInit = maxCountProp.getInitializer();
      if (maxInit && Node.isNumericLiteral(maxInit)) {
        maxCount = maxInit.getLiteralValue();
      }
    }

    fields.push({
      name: nameInit.getLiteralValue(),
      // A field declared with maxCount > 1 accepts an array of files.
      multiple: maxCount === undefined ? false : maxCount > 1,
      maxCount,
    });
  }

  return fields;
}

/** Maps one interceptor call to the file fields it declares. */
function fieldsFromInterceptor(name: string, args: Node[]): FileFieldInfo[] {
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
export function extractFileFields(method: MethodDeclaration): FileFieldInfo[] {
  const fields: FileFieldInfo[] = [];

  for (const decorator of method.getDecorators()) {
    if (decorator.getName() !== 'UseInterceptors') continue;

    const args = decorator.getCallExpression()?.getArguments() ?? [];

    for (const arg of args) {
      if (!Node.isCallExpression(arg)) continue;

      const callee = arg.getExpression();
      if (!Node.isIdentifier(callee)) continue;

      fields.push(...fieldsFromInterceptor(callee.getText(), arg.getArguments()));
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
