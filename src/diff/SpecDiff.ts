/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/

/**
 * Compares two OpenAPI documents and classifies every change by whether it can
 * break an existing consumer.
 *
 * The classification is deliberately asymmetric, which is the whole point of the
 * tool. A change that narrows what the server *accepts* breaks callers, while a
 * change that narrows what the server *returns* breaks readers. Treating a spec
 * as a symmetric object diff produces confidently wrong verdicts, so requests
 * and responses are compared under opposite rules.
 */

export type ChangeLevel = 'breaking' | 'warning' | 'safe';

export interface SpecChange {
  level: ChangeLevel;
  /** Machine-readable identifier, e.g. `request.property.required.added`. */
  kind: string;
  /** The path template the change belongs to, e.g. `/users/{id}`. */
  path: string;
  /** Lowercase HTTP verb, when the change is scoped to one operation. */
  method?: string;
  /** Where inside the operation, e.g. `requestBody.email.maxLength`. */
  location?: string;
  /** One-line explanation aimed at a reviewer. */
  detail: string;
}

export interface DiffResult {
  changes: SpecChange[];
  breaking: SpecChange[];
  warnings: SpecChange[];
  safe: SpecChange[];
  hasBreaking: boolean;
}

type Schema = Record<string, any>;
type Spec = Record<string, any>;

/** Direction decides which narrowing counts as breaking. */
type Direction = 'request' | 'response';

const HTTP_VERBS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

interface DiffContext {
  oldSpec: Spec;
  newSpec: Spec;
  changes: SpecChange[];
  /** Guards against infinite recursion through circular `$ref`s. */
  seen: Set<string>;
}

/** Resolves a local `$ref` against `components.schemas`. */
function resolveRef(schema: Schema | undefined, spec: Spec): Schema | undefined {
  if (!schema) return schema;

  let current = schema;
  const visited = new Set<string>();

  while (current && typeof current.$ref === 'string') {
    const ref: string = current.$ref;
    if (visited.has(ref)) return current;
    visited.add(ref);

    const match = /^#\/components\/schemas\/(.+)$/.exec(ref);
    if (!match) return current;

    const target = spec?.components?.schemas?.[match[1]];
    if (!target) return current;

    current = target;
  }

  return current;
}

function schemaTypeOf(schema: Schema | undefined): string | undefined {
  if (!schema) return undefined;
  if (typeof schema.type === 'string') return schema.type;
  if (schema.properties) return 'object';
  if (schema.items) return 'array';
  return undefined;
}

function record(ctx: DiffContext, change: SpecChange): void {
  ctx.changes.push(change);
}

/** Human label for the operation a change belongs to. */
function describe(method: string | undefined, path: string): string {
  return method ? `${method.toUpperCase()} ${path}` : path;
}

/**
 * Compares numeric bounds. `tighten` states which direction narrows the accepted
 * range, so the same helper serves upper and lower bounds.
 */
function compareBound(
  ctx: DiffContext,
  base: { path: string; method?: string; location: string; direction: Direction },
  keyword: string,
  oldValue: unknown,
  newValue: unknown,
  tighten: 'increase' | 'decrease',
): void {
  const before = typeof oldValue === 'number' ? oldValue : undefined;
  const after = typeof newValue === 'number' ? newValue : undefined;

  if (before === after) return;

  const location = `${base.location}.${keyword}`;
  const operation = describe(base.method, base.path);

  // Introducing a bound where none existed narrows the accepted range.
  if (before === undefined && after !== undefined) {
    record(ctx, {
      level: base.direction === 'request' ? 'breaking' : 'safe',
      kind: `${base.direction}.constraint.added`,
      path: base.path,
      method: base.method,
      location,
      detail: `${operation}: ${keyword} constraint added (${after}) where none existed`,
    });
    return;
  }

  if (before !== undefined && after === undefined) {
    record(ctx, {
      level: 'safe',
      kind: `${base.direction}.constraint.removed`,
      path: base.path,
      method: base.method,
      location,
      detail: `${operation}: ${keyword} constraint removed (was ${before})`,
    });
    return;
  }

  if (before === undefined || after === undefined) return;

  const narrowed = tighten === 'increase' ? after > before : after < before;

  record(ctx, {
    level: narrowed && base.direction === 'request' ? 'breaking' : 'safe',
    kind: narrowed ? `${base.direction}.constraint.tightened` : `${base.direction}.constraint.relaxed`,
    path: base.path,
    method: base.method,
    location,
    detail: `${operation}: ${keyword} ${before} → ${after}`,
  });
}

/** Compares the `enum` keyword, which narrows in opposite directions per side. */
function compareEnum(
  ctx: DiffContext,
  base: { path: string; method?: string; location: string; direction: Direction },
  oldSchema: Schema,
  newSchema: Schema,
): void {
  const before: unknown[] | undefined = Array.isArray(oldSchema.enum) ? oldSchema.enum : undefined;
  const after: unknown[] | undefined = Array.isArray(newSchema.enum) ? newSchema.enum : undefined;

  if (!before && !after) return;

  const operation = describe(base.method, base.path);
  const location = `${base.location}.enum`;

  if (!before && after) {
    record(ctx, {
      level: base.direction === 'request' ? 'breaking' : 'safe',
      kind: `${base.direction}.enum.added`,
      path: base.path,
      method: base.method,
      location,
      detail: `${operation}: values restricted to [${after.join(', ')}] where any value was accepted`,
    });
    return;
  }

  if (before && !after) {
    record(ctx, {
      level: 'safe',
      kind: `${base.direction}.enum.removed`,
      path: base.path,
      method: base.method,
      location,
      detail: `${operation}: enum restriction removed`,
    });
    return;
  }

  if (!before || !after) return;

  const removed = before.filter(value => !after.includes(value));
  const added = after.filter(value => !before.includes(value));

  if (removed.length > 0) {
    record(ctx, {
      level: base.direction === 'request' ? 'breaking' : 'warning',
      kind: `${base.direction}.enum.values.removed`,
      path: base.path,
      method: base.method,
      location,
      detail:
        base.direction === 'request'
          ? `${operation}: no longer accepts [${removed.join(', ')}]`
          : `${operation}: no longer returns [${removed.join(', ')}]`,
    });
  }

  if (added.length > 0) {
    record(ctx, {
      // A new response value can reach a consumer that only handles the old set.
      level: base.direction === 'response' ? 'warning' : 'safe',
      kind: `${base.direction}.enum.values.added`,
      path: base.path,
      method: base.method,
      location,
      detail:
        base.direction === 'response'
          ? `${operation}: may now return [${added.join(', ')}], which existing consumers may not handle`
          : `${operation}: now also accepts [${added.join(', ')}]`,
    });
  }
}

function comparePattern(
  ctx: DiffContext,
  base: { path: string; method?: string; location: string; direction: Direction },
  oldSchema: Schema,
  newSchema: Schema,
): void {
  const before = oldSchema.pattern;
  const after = newSchema.pattern;
  if (before === after) return;

  const operation = describe(base.method, base.path);
  const location = `${base.location}.pattern`;

  if (!before && after) {
    record(ctx, {
      level: base.direction === 'request' ? 'breaking' : 'safe',
      kind: `${base.direction}.pattern.added`,
      path: base.path,
      method: base.method,
      location,
      detail: `${operation}: pattern constraint added (${after})`,
    });
    return;
  }

  if (before && !after) {
    record(ctx, {
      level: 'safe',
      kind: `${base.direction}.pattern.removed`,
      path: base.path,
      method: base.method,
      location,
      detail: `${operation}: pattern constraint removed`,
    });
    return;
  }

  record(ctx, {
    // Any change to an existing pattern may reject previously valid input.
    level: base.direction === 'request' ? 'breaking' : 'warning',
    kind: `${base.direction}.pattern.changed`,
    path: base.path,
    method: base.method,
    location,
    detail: `${operation}: pattern changed (${before} → ${after})`,
  });
}

/** Compares two schemas, resolving `$ref`s on both sides. */
function compareSchemas(
  ctx: DiffContext,
  base: { path: string; method?: string; location: string; direction: Direction },
  oldRaw: Schema | undefined,
  newRaw: Schema | undefined,
): void {
  const oldRefKey = oldRaw?.$ref ?? '';
  const newRefKey = newRaw?.$ref ?? '';

  // Guard against self-referencing schemas such as `Node.child: Node`.
  //
  // The key deliberately excludes the location: a location grows with every
  // level of descent, so including it would make each key unique and the
  // recursion unbounded. Tracking the pair on the current traversal path only
  // (rather than globally) still lets the same schema be compared at two
  // sibling locations.
  const cycleKey = oldRefKey || newRefKey ? `${base.direction}|${oldRefKey}|${newRefKey}` : '';
  if (cycleKey) {
    if (ctx.seen.has(cycleKey)) return;
    ctx.seen.add(cycleKey);
  }

  try {
    compareResolvedSchemas(ctx, base, oldRaw, newRaw);
  } finally {
    if (cycleKey) ctx.seen.delete(cycleKey);
  }
}

/** Compares two schemas whose `$ref`s have been checked for cycles. */
function compareResolvedSchemas(
  ctx: DiffContext,
  base: { path: string; method?: string; location: string; direction: Direction },
  oldRaw: Schema | undefined,
  newRaw: Schema | undefined,
): void {
  const oldSchema = resolveRef(oldRaw, ctx.oldSpec);
  const newSchema = resolveRef(newRaw, ctx.newSpec);

  if (!oldSchema || !newSchema) return;

  const operation = describe(base.method, base.path);

  const oldType = schemaTypeOf(oldSchema);
  const newType = schemaTypeOf(newSchema);

  if (oldType && newType && oldType !== newType) {
    record(ctx, {
      level: 'breaking',
      kind: `${base.direction}.type.changed`,
      path: base.path,
      method: base.method,
      location: `${base.location}.type`,
      detail: `${operation}: type changed ${oldType} → ${newType}`,
    });
    return;
  }

  if (oldSchema.format !== newSchema.format) {
    const added = !oldSchema.format && newSchema.format;
    record(ctx, {
      level: base.direction === 'request' && added ? 'breaking' : 'safe',
      kind: `${base.direction}.format.changed`,
      path: base.path,
      method: base.method,
      location: `${base.location}.format`,
      detail: `${operation}: format ${oldSchema.format ?? 'none'} → ${newSchema.format ?? 'none'}`,
    });
  }

  compareBound(ctx, base, 'maxLength', oldSchema.maxLength, newSchema.maxLength, 'decrease');
  compareBound(ctx, base, 'minLength', oldSchema.minLength, newSchema.minLength, 'increase');
  compareBound(ctx, base, 'maximum', oldSchema.maximum, newSchema.maximum, 'decrease');
  compareBound(ctx, base, 'minimum', oldSchema.minimum, newSchema.minimum, 'increase');
  compareBound(ctx, base, 'maxItems', oldSchema.maxItems, newSchema.maxItems, 'decrease');
  compareBound(ctx, base, 'minItems', oldSchema.minItems, newSchema.minItems, 'increase');

  compareEnum(ctx, base, oldSchema, newSchema);
  comparePattern(ctx, base, oldSchema, newSchema);

  if (oldSchema.items || newSchema.items) {
    compareSchemas(
      ctx,
      { ...base, location: `${base.location}[]` },
      oldSchema.items,
      newSchema.items,
    );
  }

  compareObjectProperties(ctx, base, oldSchema, newSchema);
}

/** Compares object properties and the `required` list. */
function compareObjectProperties(
  ctx: DiffContext,
  base: { path: string; method?: string; location: string; direction: Direction },
  oldSchema: Schema,
  newSchema: Schema,
): void {
  const oldProps: Record<string, Schema> = oldSchema.properties ?? {};
  const newProps: Record<string, Schema> = newSchema.properties ?? {};

  if (Object.keys(oldProps).length === 0 && Object.keys(newProps).length === 0) return;

  const oldRequired = new Set<string>(Array.isArray(oldSchema.required) ? oldSchema.required : []);
  const newRequired = new Set<string>(Array.isArray(newSchema.required) ? newSchema.required : []);
  const operation = describe(base.method, base.path);

  for (const name of Object.keys(newProps)) {
    const location = `${base.location}.${name}`;

    if (!(name in oldProps)) {
      const isRequired = newRequired.has(name);
      record(ctx, {
        // A new required request field breaks every existing caller.
        level: base.direction === 'request' && isRequired ? 'breaking' : 'safe',
        kind: `${base.direction}.property.added`,
        path: base.path,
        method: base.method,
        location,
        detail:
          base.direction === 'request'
            ? `${operation}: new ${isRequired ? 'required' : 'optional'} field \`${name}\``
            : `${operation}: new field \`${name}\` in the response`,
      });
      continue;
    }

    if (!oldRequired.has(name) && newRequired.has(name)) {
      record(ctx, {
        level: base.direction === 'request' ? 'breaking' : 'safe',
        kind: `${base.direction}.property.required.added`,
        path: base.path,
        method: base.method,
        location,
        detail: `${operation}: \`${name}\` is now required`,
      });
    } else if (oldRequired.has(name) && !newRequired.has(name)) {
      record(ctx, {
        // A response field that is no longer guaranteed breaks readers.
        level: base.direction === 'response' ? 'breaking' : 'safe',
        kind: `${base.direction}.property.required.removed`,
        path: base.path,
        method: base.method,
        location,
        detail:
          base.direction === 'response'
            ? `${operation}: \`${name}\` is no longer always present`
            : `${operation}: \`${name}\` is no longer required`,
      });
    }

    compareSchemas(ctx, { ...base, location }, oldProps[name], newProps[name]);
  }

  for (const name of Object.keys(oldProps)) {
    if (name in newProps) continue;

    record(ctx, {
      // Readers depend on response fields; senders merely stop being able to send.
      level: base.direction === 'response' ? 'breaking' : 'warning',
      kind: `${base.direction}.property.removed`,
      path: base.path,
      method: base.method,
      location: `${base.location}.${name}`,
      detail:
        base.direction === 'response'
          ? `${operation}: field \`${name}\` removed from the response`
          : `${operation}: field \`${name}\` is no longer accepted`,
    });
  }
}

function parameterKey(parameter: Record<string, any>): string {
  return `${parameter.in}:${parameter.name}`;
}

function compareParameters(
  ctx: DiffContext,
  path: string,
  method: string,
  oldOperation: Record<string, any>,
  newOperation: Record<string, any>,
): void {
  const oldParams: Record<string, any>[] = oldOperation.parameters ?? [];
  const newParams: Record<string, any>[] = newOperation.parameters ?? [];

  const oldByKey = new Map(oldParams.map(p => [parameterKey(p), p]));
  const newByKey = new Map(newParams.map(p => [parameterKey(p), p]));
  const operation = describe(method, path);

  for (const [key, parameter] of newByKey) {
    const previous = oldByKey.get(key);

    if (!previous) {
      record(ctx, {
        level: parameter.required ? 'breaking' : 'safe',
        kind: 'parameter.added',
        path,
        method,
        location: key,
        detail: `${operation}: new ${parameter.required ? 'required' : 'optional'} ${parameter.in} parameter \`${parameter.name}\``,
      });
      continue;
    }

    if (!previous.required && parameter.required) {
      record(ctx, {
        level: 'breaking',
        kind: 'parameter.required.added',
        path,
        method,
        location: key,
        detail: `${operation}: ${parameter.in} parameter \`${parameter.name}\` is now required`,
      });
    } else if (previous.required && !parameter.required) {
      record(ctx, {
        level: 'safe',
        kind: 'parameter.required.removed',
        path,
        method,
        location: key,
        detail: `${operation}: ${parameter.in} parameter \`${parameter.name}\` is no longer required`,
      });
    }

    compareSchemas(
      ctx,
      { path, method, location: key, direction: 'request' },
      previous.schema,
      parameter.schema,
    );
  }

  for (const [key, parameter] of oldByKey) {
    if (newByKey.has(key)) continue;

    record(ctx, {
      level: 'warning',
      kind: 'parameter.removed',
      path,
      method,
      location: key,
      detail: `${operation}: ${parameter.in} parameter \`${parameter.name}\` removed`,
    });
  }
}

/**
 * Picks the schema to compare from a request or response body.
 *
 * Reading only `application/json` left every `multipart/form-data` upload
 * invisible to the diff, so removing a required file field passed the gate
 * silently. JSON is still preferred when both are present.
 */
function bodySchemaOf(body: Record<string, any> | undefined): Schema | undefined {
  const content: Record<string, any> | undefined = body?.content;
  if (!content) return undefined;

  const preferred = content['application/json'] ?? content['multipart/form-data'];
  if (preferred) return preferred.schema;

  const firstMediaType = Object.keys(content)[0];
  return firstMediaType ? content[firstMediaType]?.schema : undefined;
}

/** Lists the media types a body declares. */
function mediaTypesOf(body: Record<string, any> | undefined): string[] {
  return Object.keys(body?.content ?? {}).sort();
}

function compareRequestBody(
  ctx: DiffContext,
  path: string,
  method: string,
  oldOperation: Record<string, any>,
  newOperation: Record<string, any>,
): void {
  const oldBody = oldOperation.requestBody;
  const newBody = newOperation.requestBody;
  const operation = describe(method, path);

  if (!oldBody && newBody) {
    record(ctx, {
      level: newBody.required ? 'breaking' : 'safe',
      kind: 'requestBody.added',
      path,
      method,
      location: 'requestBody',
      detail: `${operation}: a${newBody.required ? ' required' : 'n optional'} request body is now expected`,
    });
    return;
  }

  if (oldBody && !newBody) {
    record(ctx, {
      level: 'warning',
      kind: 'requestBody.removed',
      path,
      method,
      location: 'requestBody',
      detail: `${operation}: request body is no longer read`,
    });
    return;
  }

  if (!oldBody || !newBody) return;

  if (!oldBody.required && newBody.required) {
    record(ctx, {
      level: 'breaking',
      kind: 'requestBody.required.added',
      path,
      method,
      location: 'requestBody',
      detail: `${operation}: request body is now required`,
    });
  }

  const oldTypes = mediaTypesOf(oldBody);
  const newTypes = mediaTypesOf(newBody);

  // Switching between JSON and multipart invalidates every existing caller.
  if (oldTypes.length > 0 && newTypes.length > 0 && oldTypes.join(',') !== newTypes.join(',')) {
    record(ctx, {
      level: 'breaking',
      kind: 'requestBody.mediaType.changed',
      path,
      method,
      location: 'requestBody.content',
      detail: `${operation}: request content type changed (${oldTypes.join(', ')} → ${newTypes.join(', ')})`,
    });
  }

  compareSchemas(
    ctx,
    { path, method, location: 'requestBody', direction: 'request' },
    bodySchemaOf(oldBody),
    bodySchemaOf(newBody),
  );
}

function compareResponses(
  ctx: DiffContext,
  path: string,
  method: string,
  oldOperation: Record<string, any>,
  newOperation: Record<string, any>,
): void {
  const oldResponses: Record<string, any> = oldOperation.responses ?? {};
  const newResponses: Record<string, any> = newOperation.responses ?? {};
  const operation = describe(method, path);

  for (const status of Object.keys(oldResponses)) {
    if (!(status in newResponses)) {
      record(ctx, {
        level: 'breaking',
        kind: 'response.removed',
        path,
        method,
        location: `responses.${status}`,
        detail: `${operation}: no longer documents a ${status} response`,
      });
      continue;
    }

    compareSchemas(
      ctx,
      { path, method, location: `responses.${status}`, direction: 'response' },
      bodySchemaOf(oldResponses[status]),
      bodySchemaOf(newResponses[status]),
    );
  }

  for (const status of Object.keys(newResponses)) {
    if (status in oldResponses) continue;

    record(ctx, {
      level: 'safe',
      kind: 'response.added',
      path,
      method,
      location: `responses.${status}`,
      detail: `${operation}: documents a new ${status} response`,
    });
  }
}

function compareSecurity(
  ctx: DiffContext,
  path: string,
  method: string,
  oldOperation: Record<string, any>,
  newOperation: Record<string, any>,
): void {
  const before: unknown[] = oldOperation.security ?? [];
  const after: unknown[] = newOperation.security ?? [];
  const operation = describe(method, path);

  if (before.length === 0 && after.length > 0) {
    record(ctx, {
      level: 'breaking',
      kind: 'security.added',
      path,
      method,
      location: 'security',
      detail: `${operation}: now requires authentication`,
    });
  } else if (before.length > 0 && after.length === 0) {
    record(ctx, {
      level: 'safe',
      kind: 'security.removed',
      path,
      method,
      location: 'security',
      detail: `${operation}: no longer requires authentication`,
    });
  }
}

function compareOperation(
  ctx: DiffContext,
  path: string,
  method: string,
  oldOperation: Record<string, any>,
  newOperation: Record<string, any>,
): void {
  const operation = describe(method, path);

  if (!oldOperation.deprecated && newOperation.deprecated) {
    record(ctx, {
      level: 'warning',
      kind: 'operation.deprecated',
      path,
      method,
      detail: `${operation}: marked deprecated`,
    });
  }

  compareParameters(ctx, path, method, oldOperation, newOperation);
  compareRequestBody(ctx, path, method, oldOperation, newOperation);
  compareResponses(ctx, path, method, oldOperation, newOperation);
  compareSecurity(ctx, path, method, oldOperation, newOperation);
}

function operationsOf(pathItem: Record<string, any> | undefined): string[] {
  if (!pathItem) return [];
  return HTTP_VERBS.filter(verb => pathItem[verb]);
}

/**
 * Diffs two OpenAPI documents.
 *
 * @param oldSpec The baseline document, typically from the main branch
 * @param newSpec The candidate document, typically from the pull request
 */
export function diffSpecs(oldSpec: Spec, newSpec: Spec): DiffResult {
  const ctx: DiffContext = {
    oldSpec: oldSpec ?? {},
    newSpec: newSpec ?? {},
    changes: [],
    seen: new Set(),
  };

  const oldPaths: Record<string, any> = ctx.oldSpec.paths ?? {};
  const newPaths: Record<string, any> = ctx.newSpec.paths ?? {};

  for (const path of Object.keys(oldPaths)) {
    if (!(path in newPaths)) {
      record(ctx, {
        level: 'breaking',
        kind: 'path.removed',
        path,
        detail: `${path}: removed`,
      });
      continue;
    }

    for (const method of operationsOf(oldPaths[path])) {
      const newOperation = newPaths[path][method];

      if (!newOperation) {
        record(ctx, {
          level: 'breaking',
          kind: 'operation.removed',
          path,
          method,
          detail: `${describe(method, path)}: removed`,
        });
        continue;
      }

      compareOperation(ctx, path, method, oldPaths[path][method], newOperation);
    }
  }

  for (const path of Object.keys(newPaths)) {
    if (!(path in oldPaths)) {
      record(ctx, {
        level: 'safe',
        kind: 'path.added',
        path,
        detail: `${path}: added`,
      });
      continue;
    }

    for (const method of operationsOf(newPaths[path])) {
      if (oldPaths[path][method]) continue;

      record(ctx, {
        level: 'safe',
        kind: 'operation.added',
        path,
        method,
        detail: `${describe(method, path)}: added`,
      });
    }
  }

  const breaking = ctx.changes.filter(c => c.level === 'breaking');
  const warnings = ctx.changes.filter(c => c.level === 'warning');
  const safe = ctx.changes.filter(c => c.level === 'safe');

  return {
    changes: ctx.changes,
    breaking,
    warnings,
    safe,
    hasBreaking: breaking.length > 0,
  };
}
