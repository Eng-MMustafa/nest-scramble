/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import { compareSpecificity, isParamSegment, requestSegments } from '../utils/RoutePath';
import { Fake } from '../utils/Fake';

const BODILESS_STATUSES = new Set([204, 205, 304]);
const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);

interface MockRoute {
  method: string;
  segments: string[];
  operation: any;
}

export interface MockResult {
  status: number;
  body?: unknown;
  headers: Record<string, string>;
}

/**
 * Answers requests from an OpenAPI document alone: picks the documented
 * success response, prefers its literal `example`, and otherwise generates a
 * payload from the schema (resolving `$ref`s into `components.schemas`).
 * Framework-agnostic, so `nest-scramble serve` can mock Express APIs with the
 * response shapes inferred from `res.status(201).json({...})`.
 */
export class SpecMockServer {
  private readonly routes: MockRoute[] = [];
  private readonly schemas: Record<string, any>;

  constructor(private readonly spec: any) {
    this.schemas = (spec.components && spec.components.schemas) || {};
    for (const [rawPath, methods] of Object.entries<any>(spec.paths || {})) {
      for (const [method, operation] of Object.entries<any>(methods || {})) {
        if (!HTTP_METHODS.has(method)) continue;
        this.routes.push({ method, segments: requestSegments(rawPath), operation });
      }
    }
  }

  /** Resolves a request; `null` when no documented route matches. */
  handle(method: string, pathname: string): MockResult | null {
    const verb = method.toLowerCase();
    const incoming = requestSegments(pathname);
    const candidates = this.routes
      .filter((r) => (r.method === verb || (verb === 'head' && r.method === 'get')) && r.segments.length === incoming.length)
      .filter((r) => r.segments.every((seg, i) => isParamSegment(seg) || seg === incoming[i]))
      .sort((a, b) => compareSpecificity(a.segments, b.segments));

    const match = candidates[0];
    if (!match) return null;

    const responses = match.operation.responses || {};
    const codes = Object.keys(responses).filter((c) => /^2\d\d$/.test(c)).sort((a, b) => a.localeCompare(b));
    const code = codes[0] || (verb === 'post' ? '201' : '200');
    const status = Number(code);
    const headers: Record<string, string> = { 'X-Scramble-Mock': 'true' };
    if (BODILESS_STATUSES.has(status) || verb === 'head') return { status, headers };

    const response = responses[code] || {};
    const content = response.content || {};
    const mediaType = content['application/json'] || content[Object.keys(content)[0]];
    if (!mediaType) return { status, headers, body: {} };
    if (mediaType.example !== undefined) return { status, headers, body: mediaType.example };
    if (mediaType.examples) {
      const first = Object.values<any>(mediaType.examples)[0];
      if (first && first.value !== undefined) return { status, headers, body: first.value };
    }
    return { status, headers, body: this.generate(mediaType.schema || {}, 0, '') };
  }

  /** Generates a value for a JSON schema using the same heuristics as the Nest mock. */
  generate(rawSchema: any, depth: number, name: string): any {
    const schema = this.resolve(rawSchema, 0);
    if (!schema || depth > 8) return null;
    if (schema.example !== undefined) return schema.example;
    if (schema.default !== undefined) return schema.default;
    if (Array.isArray(schema.enum) && schema.enum.length) return Fake.arrayElement(schema.enum);
    if (schema.oneOf || schema.anyOf) return this.generate((schema.oneOf || schema.anyOf)[0], depth + 1, name);
    if (schema.allOf) {
      return Object.assign({}, ...schema.allOf.map((s: any) => this.generate(s, depth + 1, name) || {}));
    }

    const type = schema.type || (schema.properties ? 'object' : schema.items ? 'array' : 'string');
    switch (type) {
      case 'object': {
        const out: Record<string, any> = {};
        const required = new Set<string>(schema.required || []);
        for (const [key, prop] of Object.entries<any>(schema.properties || {})) {
          if (required.size && !required.has(key) && Fake.boolean() && depth > 0) continue;
          out[key] = this.generate(prop, depth + 1, key);
        }
        return out;
      }
      case 'array': {
        const count = Math.max(schema.minItems || 0, Fake.int(1, 3));
        return Array.from({ length: count }, () => this.generate(schema.items || {}, depth + 1, name));
      }
      case 'integer': return this.number(schema, name, true);
      case 'number': return this.number(schema, name, false);
      case 'boolean': return Fake.boolean();
      case 'null': return null;
      default: return this.string(schema, name);
    }
  }

  private number(schema: any, name: string, integer: boolean): number {
    const lower = name.toLowerCase();
    let min = schema.minimum !== undefined ? schema.minimum : /(^|_)(id|count|quantity|qty|page|limit)$/.test(lower) ? 1 : 0;
    let max = schema.maximum !== undefined ? schema.maximum : /age$/.test(lower) ? 80 : /(^|_)id$/.test(lower) ? 1000 : /price|amount|total/.test(lower) ? 500 : 100;
    if (schema.exclusiveMinimum === true) min += 1;
    if (schema.exclusiveMaximum === true) max -= 1;
    if (max < min) max = min;
    const value = Fake.int(Math.ceil(min), Math.floor(max));
    return integer || /(^|_)(id|count|quantity|qty|page|limit|age|stock)$/.test(lower) ? value : Number((value + Fake.int(0, 99) / 100).toFixed(2));
  }

  private string(schema: any, name: string): string {
    const lower = name.toLowerCase();
    switch (schema.format) {
      case 'email': return Fake.email();
      case 'uri': case 'url': return Fake.url();
      case 'uuid': return this.uuid();
      case 'date-time': return Fake.recentDate().toISOString();
      case 'date': return Fake.recentDate().toISOString().slice(0, 10);
      case 'binary': case 'byte': return 'base64...';
      case 'ipv4': return `192.168.${Fake.int(0, 255)}.${Fake.int(1, 254)}`;
      default: break;
    }
    if (schema.pattern && /^\^?\d/.test(schema.pattern)) return String(Fake.int(1000, 9999));
    if (/email/.test(lower)) return Fake.email();
    if (/(^|_)(name|fullname|firstname|lastname|author|owner|user)$/.test(lower)) return Fake.fullName();
    if (/phone|mobile|tel/.test(lower)) return Fake.phone();
    if (/street|address/.test(lower)) return Fake.streetAddress();
    if (/city/.test(lower)) return Fake.city();
    if (/country/.test(lower)) return Fake.country();
    if (/url|website|link|avatar|image/.test(lower)) return Fake.url();
    if (/(^|_)id$|uuid|token|key$/.test(lower)) return this.uuid();
    if (/(?:date)|(?:created)|(?:updated)|(?:at$)/.test(lower)) return Fake.recentDate().toISOString();
    if (/description|bio|content|body|message|note/.test(lower)) return Fake.sentences();
    if (/title|subject|summary/.test(lower)) return Fake.words(3);
    if (/status|state/.test(lower)) return 'active';
    if (/password|secret/.test(lower)) return '********';
    let value = Fake.words(2);
    if (schema.minLength && value.length < schema.minLength) value = value.padEnd(schema.minLength, 'x');
    if (schema.maxLength && value.length > schema.maxLength) value = value.slice(0, schema.maxLength);
    return value;
  }

  private uuid(): string {
    const hex = () => Fake.int(0, 0xffff).toString(16).padStart(4, '0');
    return `${hex()}${hex()}-${hex()}-4${hex().slice(1)}-a${hex().slice(1)}-${hex()}${hex()}${hex()}`;
  }

  private resolve(schema: any, depth: number): any {
    if (!schema || typeof schema !== 'object' || depth > 12) return schema;
    if (schema.$ref) {
      const name = String(schema.$ref).split('/').pop() || '';
      return this.resolve(this.schemas[name], depth + 1);
    }
    return schema;
  }
}
