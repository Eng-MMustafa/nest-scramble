/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import { isParamSegment, requestSegments } from '../utils/RoutePath';

/**
 * A mismatch between the documented contract and a real response.
 *
 * Static analysis promises that the docs match the code; drift detection
 * proves it at runtime. Every issue points at the exact field so the fix is
 * one hop away — either the code or the return type annotation is wrong.
 */
export interface DriftIssue {
  kind:
    | 'undocumented-route'
    | 'undocumented-status'
    | 'missing-field'
    | 'unexpected-field'
    | 'type-mismatch';
  /** Dotted location inside the payload, e.g. `items[].price`. */
  location: string;
  message: string;
}

export interface DriftFinding {
  method: string;
  path: string;
  status: number;
  issues: DriftIssue[];
  at: string;
}

/** JSON Schema `type` for a runtime value, or null when out of scope. */
function jsonType(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return 'array';
  const t = typeof value;
  if (t === 'string' || t === 'boolean' || t === 'object') return t;
  if (t === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return null;
}

function typeMatches(actual: string, documented: string): boolean {
  if (actual === documented) return true;
  // JSON has one number type; an integer value satisfies `number`.
  if (documented === 'number' && actual === 'integer') return true;
  return false;
}

function resolveRef(schema: any, spec: any, depth = 0): any {
  if (!schema || depth > 12) return schema || {};
  if (schema.$ref) {
    const parts = String(schema.$ref).replace('#/', '').split('/');
    let node = spec;
    for (const part of parts) {
      if (!node) break;
      node = node[part];
    }
    return resolveRef(node || {}, spec, depth + 1);
  }
  return schema;
}

/**
 * Compares a runtime payload against its documented schema.
 *
 * The comparison is deliberately lenient where the schema is vague (no `type`,
 * `oneOf`, free-form objects) — a drift detector that cries wolf gets disabled,
 * and then it catches nothing.
 */
export function compareWithSchema(
  payload: unknown,
  schema: any,
  spec: any,
  location = '',
  depth = 0,
): DriftIssue[] {
  if (depth > 8) return [];
  schema = resolveRef(schema, spec);
  if (!schema || Object.keys(schema).length === 0) return [];

  const issues: DriftIssue[] = [];
  const here = location || '(root)';

  if (payload === null || payload === undefined) return issues;

  const actualType = jsonType(payload);
  if (!actualType) return issues;

  // Union-ish schemas: accept if any variant is clean.
  const variants = schema.oneOf || schema.anyOf;
  if (Array.isArray(variants) && variants.length) {
    const clean = variants.some(
      (variant: any) => compareWithSchema(payload, variant, spec, location, depth + 1).length === 0,
    );
    if (!clean) {
      issues.push({
        kind: 'type-mismatch',
        location: here,
        message: `Value matches none of the ${variants.length} documented variants.`,
      });
    }
    return issues;
  }

  const documentedType: string | undefined =
    schema.type || (schema.properties ? 'object' : undefined);
  if (!documentedType) return issues;

  if (!typeMatches(actualType, documentedType)) {
    issues.push({
      kind: 'type-mismatch',
      location: here,
      message: `Documented as '${documentedType}' but the API returned '${actualType}'.`,
    });
    return issues;
  }

  if (documentedType === 'array' && Array.isArray(payload)) {
    // The first element is representative; checking all of them would repeat
    // the same issue N times.
    if (payload.length > 0 && schema.items) {
      issues.push(...compareWithSchema(payload[0], schema.items, spec, location + '[]', depth + 1));
    }
    return issues;
  }

  if (documentedType === 'object' && typeof payload === 'object') {
    const properties = schema.properties || {};
    const documented = new Set(Object.keys(properties));
    // A free-form object (no properties) or explicit additionalProperties
    // means extra keys are fine.
    const allowsExtra = documented.size === 0 || schema.additionalProperties === true;

    for (const key of Object.keys(payload as Record<string, unknown>)) {
      if (!documented.has(key)) {
        if (!allowsExtra) {
          issues.push({
            kind: 'unexpected-field',
            location: location ? location + '.' + key : key,
            message: `Field '${key}' is returned by the API but missing from the docs — add it to the return type.`,
          });
        }
        continue;
      }
      issues.push(
        ...compareWithSchema(
          (payload as Record<string, unknown>)[key],
          properties[key],
          spec,
          location ? location + '.' + key : key,
          depth + 1,
        ),
      );
    }

    for (const key of schema.required || []) {
      if ((payload as Record<string, unknown>)[key] === undefined) {
        issues.push({
          kind: 'missing-field',
          location: location ? location + '.' + key : key,
          message: `Field '${key}' is documented as required but the API did not return it.`,
        });
      }
    }
  }

  return issues;
}

/** Finds the documented spec path matching a concrete request path. */
export function matchSpecPath(spec: any, requestPath: string): string | null {
  const paths = Object.keys(spec?.paths || {});
  const request = requestSegments(requestPath);

  let best: string | null = null;
  let bestParams = Infinity;

  for (const specPath of paths) {
    const segments = requestSegments(specPath);
    if (segments.length !== request.length) continue;

    let params = 0;
    let matches = true;
    for (let i = 0; i < segments.length; i++) {
      if (isParamSegment(segments[i])) {
        params += 1;
      } else if (segments[i] !== request[i]) {
        matches = false;
        break;
      }
    }

    // Prefer the most specific documented route, mirroring router behaviour.
    if (matches && params < bestParams) {
      best = specPath;
      bestParams = params;
    }
  }

  return best;
}

/**
 * Checks one completed request/response pair against the OpenAPI document.
 * Pure function: trivially testable, no Nest dependency.
 */
export function checkDrift(
  spec: any,
  method: string,
  requestPath: string,
  status: number,
  body: unknown,
): DriftIssue[] {
  const specPath = matchSpecPath(spec, requestPath);
  if (!specPath) {
    return [{
      kind: 'undocumented-route',
      location: '(route)',
      message: `${method.toUpperCase()} ${requestPath} is served by the app but does not appear in the generated docs.`,
    }];
  }

  const operation = spec.paths[specPath][method.toLowerCase()];
  if (!operation) {
    return [{
      kind: 'undocumented-route',
      location: '(route)',
      message: `${method.toUpperCase()} is not documented for ${specPath}.`,
    }];
  }

  const responses = operation.responses || {};
  const documented = responses[String(status)] || (status < 400 ? responses.default : undefined);
  if (!documented) {
    // Only flag success statuses: ad-hoc error statuses (rate limits,
    // gateway errors) are noise, not contract drift.
    if (status >= 200 && status < 300) {
      return [{
        kind: 'undocumented-status',
        location: '(status)',
        message: `Status ${status} is returned but not documented for ${method.toUpperCase()} ${specPath}.`,
      }];
    }
    return [];
  }

  const schema = documented.content?.['application/json']?.schema;
  if (!schema) return [];

  return compareWithSchema(body, schema, spec);
}
