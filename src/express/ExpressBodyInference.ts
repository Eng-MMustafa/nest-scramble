/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import {
  balancedSlice, chainSegments, genericArgs, isStringLiteral, objectEntries,
  splitTopLevel, stripComments, unquote,
} from './ExpressLexical';
import { ExpressSymbolRegistry, SymbolDefinition } from './ExpressSymbolRegistry';

export interface InferredBody {
  properties: Record<string, any>;
  required: string[];
  /** Where the shape came from — surfaces in the docs description. */
  source: 'zod' | 'joi' | 'yup' | 'express-validator' | 'typescript' | 'destructuring' | 'property-access';
  /** Named type/schema the body was derived from, when any (`CreateUserDto`). */
  name?: string;
}

interface FieldSchema {
  schema: any;
  optional: boolean;
}

/**
 * Infers a JSON request-body schema for an Express route from the sources
 * developers actually use: Zod / Joi / Yup schemas, express-validator chains,
 * TypeScript `Request<P, R, Body>` generics or DTO casts, and finally plain
 * `req.body` destructuring / property access.
 */
export class ExpressBodyInference {
  constructor(private readonly registry: ExpressSymbolRegistry) {}

  /**
   * @param head  text of the route call up to the handler body (middleware + handler signature)
   * @param body  the handler body (braces included)
   * @param filePath  file the route lives in — import resolution starts here
   */
  infer(head: string, body: string, filePath: string): InferredBody | undefined {
    const combined = `${head}\n${body}`;

    for (const candidate of this.schemaCandidates(head, body)) {
      const inferred = this.fromSymbol(candidate, filePath);
      if (inferred) return inferred;
    }

    // Inline schemas passed straight to a validator: validate(z.object({...}))
    const inlineZod = /\bz\.object\s*\(/.exec(combined);
    if (inlineZod) {
      const shape = this.zodObject(balancedSlice(combined, inlineZod.index + inlineZod[0].length - 1), filePath);
      if (shape) return { ...shape, source: 'zod' };
    }
    const inlineJoi = /\b[Jj]oi\.object\s*\(/.exec(combined);
    if (inlineJoi) {
      const shape = this.joiObject(balancedSlice(combined, inlineJoi.index + inlineJoi[0].length - 1), filePath);
      if (shape) return { ...shape, source: 'joi' };
    }
    const validatorChains = this.expressValidator(combined);
    if (validatorChains) return validatorChains;

    for (const typeName of this.typeCandidates(head, body)) {
      const inferred = this.fromSymbol(typeName, filePath);
      if (inferred) return inferred;
    }

    return this.fromUsage(body);
  }

  /* ------------------------------------------------------------------ *
   * Candidate discovery
   * ------------------------------------------------------------------ */

  private schemaCandidates(head: string, body: string): string[] {
    const combined = stripComments(`${head}\n${body}`);
    const found: string[] = [];
    const push = (name?: string) => { if (name && !found.includes(name) && !/^(req|res|next|z|Joi|joi|yup|body|check)$/.test(name)) found.push(name); };
    let m: RegExpExecArray | null;

    // schema.parse(req.body) / safeParse / parseAsync / validate / validateAsync / validateSync / cast
    const direct = /([A-Za-z_$][\w$.]*)\.(?:parse|safeParse|parseAsync|safeParseAsync|validate|validateAsync|validateSync|cast)\s*\(\s*req\.body/g;
    while ((m = direct.exec(combined)) !== null) push(m[1]);

    // Joi.attempt(req.body, schema) / schema.validate(req.body)
    const attempt = /[Jj]oi\.attempt\s*\(\s*req\.body\s*,\s*([A-Za-z_$][\w$.]*)/g;
    while ((m = attempt.exec(combined)) !== null) push(m[1]);

    // Middleware wrappers: validate(schema), validateBody(schema), validateRequest({ body: schema }),
    // celebrate({ body: schema }), zValidator('json', schema)
    const wrapper = /\b(?:validate|validateBody|validateRequest|validateSchema|validation|celebrate|zValidator|checkSchema|validator)\s*\(([^)]*)\)/g;
    while ((m = wrapper.exec(head)) !== null) {
      const args = m[1];
      const bodyKey = /\bbody\s*:\s*([A-Za-z_$][\w$.]*)/.exec(args);
      if (bodyKey) push(bodyKey[1]);
      for (const arg of splitTopLevel(args, ',')) {
        const ident = /^([A-Za-z_$][\w$.]*)$/.exec(arg.trim());
        if (ident) push(ident[1]);
      }
    }

    // Any bare identifier used as middleware that *looks* like a schema/validator.
    const schemaLike = /\b([A-Za-z_$][\w$]*(?:Schema|Validator|Validation|Validators|Rules))\b/g;
    while ((m = schemaLike.exec(head)) !== null) push(m[1]);

    // Every remaining bare middleware argument: `router.post('/', validateProduct, handler)`.
    // Whatever does not resolve to a schema/validator array is simply ignored.
    const open = head.indexOf('(');
    if (open !== -1) {
      for (const arg of splitTopLevel(head.slice(open + 1), ',')) {
        const ident = /^([A-Za-z_$][\w$.]*)$/.exec(arg.trim());
        if (ident) push(ident[1]);
      }
    }

    return found;
  }

  private typeCandidates(head: string, body: string): string[] {
    const found: string[] = [];
    const push = (name?: string) => {
      const clean = (name || '').trim().replace(/\[\]$/, '');
      if (/^[A-Z][\w$.]*$/.test(clean) && !/^(Request|Response|Record|Partial|Pick|Omit|Array|Promise|Express)$/.test(clean) && !found.includes(clean)) found.push(clean);
    };

    // (req: Request<Params, ResBody, ReqBody>, res)
    const reqType = /\breq\s*:\s*((?:express\.|Express\.)?Request\s*<)/.exec(head);
    if (reqType) {
      const args = genericArgs(head.slice(reqType.index + reqType[0].length - reqType[1].length));
      if (args[2]) push(args[2]);
    }
    // (req: TypedRequestBody<CreateUserDto>) — single-generic custom request types
    const custom = /\breq\s*:\s*[A-Za-z_$][\w$]*(?:Body|Request)\s*<\s*([^>,]+)\s*>/.exec(head);
    if (custom && !reqType) push(custom[1]);

    let m: RegExpExecArray | null;
    const cast = /req\.body\s+as\s+([A-Za-z_$][\w$.]*)/g;
    while ((m = cast.exec(body)) !== null) push(m[1]);
    const angleCast = /<\s*([A-Za-z_$][\w$.]*)\s*>\s*req\.body/g;
    while ((m = angleCast.exec(body)) !== null) push(m[1]);
    const annotated = /(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*:\s*([A-Za-z_$][\w$.]*)\s*=\s*req\.body/g;
    while ((m = annotated.exec(body)) !== null) push(m[1]);
    const destructuredAnnotated = /(?:const|let|var)\s*\{[^}]*\}\s*:\s*([A-Za-z_$][\w$.]*)\s*=\s*req\.body/g;
    while ((m = destructuredAnnotated.exec(body)) !== null) push(m[1]);

    return found;
  }

  /* ------------------------------------------------------------------ *
   * Symbol → schema
   * ------------------------------------------------------------------ */

  private fromSymbol(name: string, filePath: string, depth = 0): InferredBody | undefined {
    if (depth > 4) return undefined;
    const def = this.registry.resolve(name, filePath);
    if (!def) return undefined;

    if (def.kind === 'value') {
      const text = def.text.trim();
      if (/^z\b|\bz\.object\s*\(/.test(text)) {
        const shape = this.zodFromExpression(text, def.filePath);
        if (shape) return { ...shape, source: 'zod', name: def.name };
      }
      if (/^[Jj]oi\b/.test(text)) {
        const shape = this.joiFromExpression(text, def.filePath);
        if (shape) return { ...shape, source: 'joi', name: def.name };
      }
      if (/^yup\b|\byup\.object\s*\(/.test(text)) {
        const shape = this.yupFromExpression(text, def.filePath);
        if (shape) return { ...shape, source: 'yup', name: def.name };
      }
      if (/^\[/.test(text) && /\b(?:body|check)\s*\(/.test(text)) {
        const chains = this.expressValidator(text);
        if (chains) return { ...chains, name: def.name };
      }
      // const CreateUserSchema = OtherSchema.extend({...}) / .pick / .omit / .partial()
      if (/^[A-Za-z_$][\w$.]*\.(?:extend|merge|pick|omit|partial|required|strict|passthrough|shape)\b/.test(text)) {
        const shape = this.zodFromExpression(text, def.filePath);
        if (shape) return { ...shape, source: 'zod', name: def.name };
      }
      return undefined;
    }

    if (def.kind === 'interface' || def.kind === 'class') {
      const shape = this.tsMembers(def.text, def.filePath, def.kind === 'class');
      for (const parent of def.extends || []) {
        const inherited = this.fromSymbol(parent, def.filePath, depth + 1);
        if (inherited) {
          shape.properties = { ...inherited.properties, ...shape.properties };
          shape.required = Array.from(new Set([...inherited.required, ...shape.required]));
        }
      }
      return { ...shape, source: 'typescript', name: def.name };
    }

    if (def.kind === 'type') {
      const shape = this.tsTypeExpression(def.text, def.filePath, depth);
      if (shape && shape.schema && shape.schema.type === 'object' && shape.schema.properties) {
        return {
          properties: shape.schema.properties,
          required: shape.schema.required || [],
          source: /z\.infer|typeof/.test(def.text) ? 'zod' : 'typescript',
          name: def.name,
        };
      }
      return undefined;
    }

    return undefined;
  }

  /* ------------------------------------------------------------------ *
   * Zod
   * ------------------------------------------------------------------ */

  private zodFromExpression(expr: string, filePath: string): { properties: Record<string, any>; required: string[] } | undefined {
    const field = this.zodField(expr, filePath, 0);
    if (!field || field.schema.type !== 'object' || !field.schema.properties) return undefined;
    return { properties: field.schema.properties, required: field.schema.required || [] };
  }

  private zodObject(parenBlock: string, filePath: string): { properties: Record<string, any>; required: string[] } | undefined {
    const inner = parenBlock.trim().replace(/^\(/, '').replace(/\)$/, '').trim();
    if (!inner.startsWith('{')) return undefined;
    const entries = objectEntries(balancedSlice(inner, 0).slice(1, -1));
    const properties: Record<string, any> = {};
    const required: string[] = [];
    for (const entry of entries) {
      if (entry.spread || entry.shorthand) continue;
      const field = this.zodField(entry.value, filePath, 1);
      if (!field) continue;
      properties[entry.key] = field.schema;
      if (!field.optional) required.push(entry.key);
    }
    return { properties, required };
  }

  /**
   * `AddressSchema.optional()` or `schemas.User.partial()` — resolve the
   * referenced schema and return the trailing calls as modifiers.
   */
  private resolveReference(
    base: { name: string; args: string },
    rest: { name: string; args: string }[],
    filePath: string,
    depth: number,
    parse: (expr: string, file: string, depth: number) => FieldSchema | undefined,
  ): { field: FieldSchema; modifiers: { name: string; args: string }[] } | undefined {
    const parts = base.name.split('.');
    for (let i = parts.length; i >= 1; i--) {
      const def = this.registry.resolve(parts.slice(0, i).join('.'), filePath);
      if (!def || def.kind !== 'value') continue;
      const field = parse(def.text, def.filePath, depth + 1);
      if (!field) return undefined;
      const trailing = parts.slice(i);
      const modifiers = trailing.length
        ? [...trailing.slice(0, -1).map((name) => ({ name, args: '' })), { name: trailing[trailing.length - 1], args: base.args }, ...rest]
        : rest;
      return { field, modifiers };
    }
    return undefined;
  }

  private zodField(expr: string, filePath: string, depth: number): FieldSchema | undefined {
    if (depth > 6) return undefined;
    const segments = chainSegments(expr);
    if (segments.length === 0) return undefined;

    const base = segments[0];
    let modifiers = segments.slice(1);
    let schema: any;
    let optional = false;
    const baseName = base.name.replace(/^z\.coerce\./, 'z.').replace(/^z\./, '');

    if (!/^z\b/.test(base.name)) {
      const ref = this.resolveReference(base, modifiers, filePath, depth, (e, f, d) => this.zodField(e, f, d));
      if (!ref) return undefined;
      schema = { ...ref.field.schema };
      optional = ref.field.optional;
      modifiers = ref.modifiers;
    } else switch (baseName) {
      case 'string': schema = { type: 'string' }; break;
      case 'number': schema = { type: 'number' }; break;
      case 'bigint': schema = { type: 'integer' }; break;
      case 'boolean': schema = { type: 'boolean' }; break;
      case 'date': schema = { type: 'string', format: 'date-time' }; break;
      case 'any': case 'unknown': schema = {}; break;
      case 'null': schema = { type: 'null' }; break;
      case 'literal': {
        const value = base.args.trim();
        schema = isStringLiteral(value) ? { type: 'string', enum: [unquote(value)] }
          : /^(true|false)$/.test(value) ? { type: 'boolean', enum: [value === 'true'] }
            : { type: 'number', enum: [Number(value)] };
        break;
      }
      case 'enum': {
        const list = base.args.trim().startsWith('[') ? balancedSlice(base.args.trim(), 0).slice(1, -1) : base.args;
        schema = { type: 'string', enum: splitTopLevel(list, ',').map(unquote) };
        break;
      }
      case 'nativeEnum': {
        const values = this.enumValues(base.args.trim(), filePath);
        schema = values ? { type: typeof values[0] === 'number' ? 'number' : 'string', enum: values } : { type: 'string' };
        break;
      }
      case 'array': {
        const item = this.zodField(base.args, filePath, depth + 1);
        schema = { type: 'array', items: item ? item.schema : {} };
        break;
      }
      case 'object': {
        const shape = this.zodObject(`(${base.args})`, filePath);
        schema = shape ? { type: 'object', properties: shape.properties, required: shape.required } : { type: 'object' };
        break;
      }
      case 'record': {
        const args = splitTopLevel(base.args, ',');
        const value = this.zodField(args[args.length - 1] || 'z.any()', filePath, depth + 1);
        schema = { type: 'object', additionalProperties: value ? value.schema : {} };
        break;
      }
      case 'union': {
        const list = base.args.trim().startsWith('[') ? balancedSlice(base.args.trim(), 0).slice(1, -1) : base.args;
        const members = splitTopLevel(list, ',').map((m) => this.zodField(m, filePath, depth + 1)).filter(Boolean) as FieldSchema[];
        schema = this.mergeUnion(members.map((m) => m.schema));
        break;
      }
      case 'tuple': schema = { type: 'array' }; break;
      case 'lazy': schema = { type: 'object' }; break;
      case 'instanceof': case 'function': case 'promise': case 'never': case 'void': case 'undefined': schema = {}; break;
      default: return undefined; // z.discriminatedUnion, z.intersection, … — not worth guessing
    }

    for (const seg of modifiers) {
      const arg = seg.args.trim();
      const num = Number(arg.split(',')[0]);
      switch (seg.name) {
        case 'optional': case 'nullish': optional = true; if (seg.name === 'nullish') schema.nullable = true; break;
        case 'nullable': schema.nullable = true; break;
        case 'default': optional = true; schema.default = this.literalValue(arg); break;
        case 'describe': schema.description = unquote(arg); break;
        case 'email': schema.format = 'email'; break;
        case 'url': schema.format = 'uri'; break;
        case 'uuid': schema.format = 'uuid'; break;
        case 'datetime': schema.format = 'date-time'; break;
        case 'ip': schema.format = 'ipv4'; break;
        case 'int': schema.type = 'integer'; break;
        case 'positive': schema.minimum = schema.type === 'integer' ? 1 : 0; if (schema.type !== 'integer') schema.exclusiveMinimum = true; break;
        case 'nonnegative': schema.minimum = 0; break;
        case 'negative': schema.maximum = 0; schema.exclusiveMaximum = true; break;
        case 'min': case 'gte': if (!Number.isNaN(num)) { if (schema.type === 'string') schema.minLength = num; else if (schema.type === 'array') schema.minItems = num; else schema.minimum = num; } break;
        case 'max': case 'lte': if (!Number.isNaN(num)) { if (schema.type === 'string') schema.maxLength = num; else if (schema.type === 'array') schema.maxItems = num; else schema.maximum = num; } break;
        case 'gt': if (!Number.isNaN(num)) { schema.minimum = num; schema.exclusiveMinimum = true; } break;
        case 'lt': if (!Number.isNaN(num)) { schema.maximum = num; schema.exclusiveMaximum = true; } break;
        case 'length': if (!Number.isNaN(num)) { schema.minLength = num; schema.maxLength = num; } break;
        case 'regex': { const src = /^\/(.*)\/[a-z]*$/s.exec(arg); schema.pattern = src ? src[1] : arg; break; }
        case 'startsWith': schema.pattern = '^' + unquote(arg); break;
        case 'endsWith': schema.pattern = unquote(arg) + '$'; break;
        case 'partial': if (schema.type === 'object') schema.required = []; break;
        case 'required': if (schema.type === 'object' && schema.properties) schema.required = Object.keys(schema.properties); break;
        case 'extend': case 'merge': {
          const extra = seg.name === 'extend'
            ? this.zodObject(`(${arg})`, filePath)
            : (() => { const f = this.zodField(arg, filePath, depth + 1); return f && f.schema.properties ? { properties: f.schema.properties, required: f.schema.required || [] } : undefined; })();
          if (extra && schema.type === 'object') {
            schema.properties = { ...(schema.properties || {}), ...extra.properties };
            schema.required = Array.from(new Set([...(schema.required || []), ...extra.required]));
          }
          break;
        }
        case 'pick': case 'omit': {
          if (schema.type === 'object' && schema.properties && arg.startsWith('{')) {
            const keys = objectEntries(balancedSlice(arg, 0).slice(1, -1)).map((e) => e.key);
            const keep = (k: string) => (seg.name === 'pick' ? keys.includes(k) : !keys.includes(k));
            schema.properties = Object.fromEntries(Object.entries(schema.properties).filter(([k]) => keep(k)));
            schema.required = (schema.required || []).filter(keep);
          }
          break;
        }
        case 'array': schema = { type: 'array', items: schema }; break;
        case 'or': { const other = this.zodField(arg, filePath, depth + 1); if (other) schema = this.mergeUnion([schema, other.schema]); break; }
        default: break; // trim, toLowerCase, refine, transform, strict, passthrough, superRefine, brand, catch…
      }
    }

    return { schema, optional };
  }

  /* ------------------------------------------------------------------ *
   * Joi
   * ------------------------------------------------------------------ */

  private joiFromExpression(expr: string, filePath: string): { properties: Record<string, any>; required: string[] } | undefined {
    const field = this.joiField(expr, filePath, 0);
    if (!field || field.schema.type !== 'object' || !field.schema.properties) return undefined;
    return { properties: field.schema.properties, required: field.schema.required || [] };
  }

  private joiObject(parenBlock: string, filePath: string): { properties: Record<string, any>; required: string[] } | undefined {
    const inner = parenBlock.trim().replace(/^\(/, '').replace(/\)$/, '').trim();
    if (!inner.startsWith('{')) return undefined;
    const properties: Record<string, any> = {};
    const required: string[] = [];
    for (const entry of objectEntries(balancedSlice(inner, 0).slice(1, -1))) {
      if (entry.spread || entry.shorthand) continue;
      const field = this.joiField(entry.value, filePath, 1);
      if (!field) continue;
      properties[entry.key] = field.schema;
      if (!field.optional) required.push(entry.key);
    }
    return { properties, required };
  }

  private joiField(expr: string, filePath: string, depth: number): FieldSchema | undefined {
    if (depth > 6) return undefined;
    const segments = chainSegments(expr);
    if (segments.length === 0) return undefined;
    const base = segments[0];
    let modifiers = segments.slice(1);
    const baseName = base.name.replace(/^[Jj]oi\./, '');
    let schema: any;
    let optional = true; // Joi fields are optional unless .required()

    if (!/^[Jj]oi\b/.test(base.name)) {
      const ref = this.resolveReference(base, modifiers, filePath, depth, (e, f, d) => this.joiField(e, f, d));
      if (!ref) return undefined;
      schema = { ...ref.field.schema };
      optional = ref.field.optional;
      modifiers = ref.modifiers;
    } else switch (baseName) {
      case 'string': schema = { type: 'string' }; break;
      case 'number': schema = { type: 'number' }; break;
      case 'boolean': case 'bool': schema = { type: 'boolean' }; break;
      case 'date': schema = { type: 'string', format: 'date-time' }; break;
      case 'any': schema = {}; break;
      case 'array': schema = { type: 'array', items: {} }; break;
      case 'object': {
        const shape = this.joiObject(`(${base.args})`, filePath);
        schema = shape ? { type: 'object', properties: shape.properties, required: shape.required } : { type: 'object' };
        break;
      }
      case 'alternatives': schema = {}; break;
      default: return undefined;
    }

    for (const seg of modifiers) {
      const arg = seg.args.trim();
      const num = Number(arg.split(',')[0]);
      switch (seg.name) {
        case 'required': optional = false; break;
        case 'optional': optional = true; break;
        case 'default': optional = true; schema.default = this.literalValue(arg); break;
        case 'description': case 'note': schema.description = unquote(arg); break;
        case 'email': schema.format = 'email'; break;
        case 'uri': schema.format = 'uri'; break;
        case 'guid': case 'uuid': schema.format = 'uuid'; break;
        case 'isoDate': schema.format = 'date-time'; break;
        case 'integer': schema.type = 'integer'; break;
        case 'positive': schema.minimum = 1; break;
        case 'min': if (!Number.isNaN(num)) { if (schema.type === 'string') schema.minLength = num; else if (schema.type === 'array') schema.minItems = num; else schema.minimum = num; } break;
        case 'max': if (!Number.isNaN(num)) { if (schema.type === 'string') schema.maxLength = num; else if (schema.type === 'array') schema.maxItems = num; else schema.maximum = num; } break;
        case 'length': if (!Number.isNaN(num)) { schema.minLength = num; schema.maxLength = num; } break;
        case 'pattern': case 'regex': { const src = /^\/(.*)\/[a-z]*$/s.exec(arg); schema.pattern = src ? src[1] : arg; break; }
        case 'valid': case 'allow': {
          const values = splitTopLevel(arg.startsWith('[') ? balancedSlice(arg, 0).slice(1, -1) : arg, ',').map((v) => this.literalValue(v));
          if (seg.name === 'allow' && values.includes(null)) schema.nullable = true;
          const concrete = values.filter((v) => v !== null && v !== undefined);
          if (seg.name === 'valid' && concrete.length) schema.enum = concrete;
          break;
        }
        case 'items': { const item = this.joiField(arg, filePath, depth + 1); if (item) schema.items = item.schema; break; }
        case 'keys': { const shape = this.joiObject(`(${arg})`, filePath); if (shape) { schema.type = 'object'; schema.properties = shape.properties; schema.required = shape.required; } break; }
        default: break;
      }
    }
    return { schema, optional };
  }

  /* ------------------------------------------------------------------ *
   * Yup (same chain grammar as Joi, required-by-call)
   * ------------------------------------------------------------------ */

  private yupFromExpression(expr: string, filePath: string): { properties: Record<string, any>; required: string[] } | undefined {
    const normalized = expr.replace(/\byup\./g, 'Joi.').replace(/\.shape\s*\(/g, '.keys(');
    return this.joiFromExpression(normalized, filePath);
  }

  /* ------------------------------------------------------------------ *
   * express-validator: body('email').isEmail(), check('age').optional().isInt()
   * ------------------------------------------------------------------ */

  private expressValidator(text: string): InferredBody | undefined {
    const pattern = /\b(?:body|check)\s*\(\s*(['"`])([^'"`]+)\1\s*\)/g;
    const properties: Record<string, any> = {};
    const required: string[] = [];
    let m: RegExpExecArray | null;
    let found = false;
    while ((m = pattern.exec(text)) !== null) {
      found = true;
      const name = m[2];
      const chain = text.slice(m.index);
      const segments = chainSegments(chain).slice(1);
      const schema: any = { type: 'string' };
      let optional = true;
      for (const seg of segments) {
        switch (seg.name) {
          case 'notEmpty': case 'exists': case 'isRequired': optional = false; break;
          case 'optional': optional = true; break;
          case 'isEmail': schema.format = 'email'; break;
          case 'isURL': schema.format = 'uri'; break;
          case 'isUUID': schema.format = 'uuid'; break;
          case 'isISO8601': case 'isDate': schema.format = 'date-time'; break;
          case 'isInt': schema.type = 'integer'; break;
          case 'isFloat': case 'isNumeric': case 'isDecimal': schema.type = 'number'; break;
          case 'isBoolean': schema.type = 'boolean'; break;
          case 'isArray': schema.type = 'array'; schema.items = {}; break;
          case 'isObject': schema.type = 'object'; break;
          case 'isIn': { const arg = seg.args.trim(); schema.enum = splitTopLevel(arg.startsWith('[') ? balancedSlice(arg, 0).slice(1, -1) : arg, ',').map(unquote); break; }
          case 'isLength': { const min = /min\s*:\s*(\d+)/.exec(seg.args); const max = /max\s*:\s*(\d+)/.exec(seg.args); if (min) schema.minLength = Number(min[1]); if (max) schema.maxLength = Number(max[1]); break; }
          case 'matches': { const src = /^\/(.*)\/[a-z]*$/s.exec(seg.args.trim()); schema.pattern = src ? src[1] : seg.args.trim(); break; }
          default: break;
        }
        if (seg.name === 'isInt' || seg.name === 'isFloat') {
          const min = /min\s*:\s*(-?\d+(?:\.\d+)?)/.exec(seg.args); const max = /max\s*:\s*(-?\d+(?:\.\d+)?)/.exec(seg.args);
          if (min) schema.minimum = Number(min[1]); if (max) schema.maximum = Number(max[1]);
        }
      }
      this.setPath(properties, name, schema);
      if (!optional && !name.includes('.')) required.push(name);
    }
    return found ? { properties, required, source: 'express-validator' } : undefined;
  }

  /* ------------------------------------------------------------------ *
   * TypeScript interfaces / type aliases / classes
   * ------------------------------------------------------------------ */

  private tsMembers(bodyText: string, filePath: string, isClass: boolean): { properties: Record<string, any>; required: string[] } {
    const properties: Record<string, any> = {};
    const required: string[] = [];
    const cleaned = stripComments(bodyText);
    // Members are separated by `;`, `,` or newlines at depth 0.
    const members = splitTopLevel(cleaned.replace(/;/g, ','), ',');
    for (const raw of members) {
      let member = raw.trim();
      if (!member || member.startsWith('constructor') || /^(?:public|private|protected|static|readonly|declare|override|abstract)\s+/.test(member) === false && isClass && /\(/.test(member.split(':')[0])) continue;
      member = member.replace(/^(?:public|private|protected|static|readonly|declare|override|abstract)\s+/g, '').replace(/^@[\w$]+(?:\([^)]*\))?\s*/g, '');
      // Strip repeated decorators/modifiers.
      while (/^@[\w$]+(?:\([^)]*\))?\s*/.test(member)) member = member.replace(/^@[\w$]+(?:\([^)]*\))?\s*/, '');
      while (/^(?:public|private|protected|static|readonly|declare|override)\s+/.test(member)) member = member.replace(/^(?:public|private|protected|static|readonly|declare|override)\s+/, '');
      if (member.startsWith('[')) continue; // index signature
      const m = /^(['"]?)([A-Za-z_$][\w$]*)\1\s*(\?|!)?\s*:\s*([\s\S]+?)(?:\s*=\s*[\s\S]*)?$/.exec(member);
      if (!m) continue;
      const name = m[2];
      const optionalMark = m[3] === '?';
      const hasDefault = /=\s*[^=>]/.test(member.slice(m[0].indexOf(m[4]) + m[4].length));
      if (/\(/.test(m[4].split(/=>|:/)[0]) && /\)\s*(?:=>|:)/.test(member)) continue; // method signature
      const field = this.tsTypeExpression(m[4].trim(), filePath, 0);
      if (!field) continue;
      properties[name] = field.schema;
      if (!optionalMark && !field.optional && !hasDefault) required.push(name);
    }
    return { properties, required };
  }

  private tsTypeExpression(typeText: string, filePath: string, depth: number): FieldSchema | undefined {
    if (depth > 6) return undefined;
    let text = typeText.trim().replace(/^\(|\)$/g, '').trim();
    let optional = false;
    let nullable = false;

    // Unions: strip null/undefined, collapse string-literal unions to enums.
    const parts = splitTopLevel(text, '|').map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1) {
      const concrete = parts.filter((p) => {
        if (p === 'undefined') { optional = true; return false; }
        if (p === 'null') { nullable = true; return false; }
        return true;
      });
      if (concrete.every((p) => isStringLiteral(p))) {
        return { schema: { type: 'string', enum: concrete.map(unquote), ...(nullable ? { nullable } : {}) }, optional };
      }
      if (concrete.every((p) => /^-?\d+(\.\d+)?$/.test(p))) {
        return { schema: { type: 'number', enum: concrete.map(Number), ...(nullable ? { nullable } : {}) }, optional };
      }
      if (concrete.length === 1) text = concrete[0];
      else {
        const members = concrete.map((p) => this.tsTypeExpression(p, filePath, depth + 1)).filter(Boolean) as FieldSchema[];
        const schema = this.mergeUnion(members.map((m) => m.schema));
        if (nullable) schema.nullable = true;
        return { schema, optional };
      }
    }

    const arrayMatch = /^(.*)\[\]$/.exec(text);
    if (arrayMatch && !text.startsWith('{')) {
      const item = this.tsTypeExpression(arrayMatch[1], filePath, depth + 1);
      return { schema: { type: 'array', items: item ? item.schema : {}, ...(nullable ? { nullable } : {}) }, optional };
    }
    const generic = /^([A-Za-z_$][\w$.]*)\s*<([\s\S]*)>$/.exec(text);
    if (generic) {
      const args = genericArgs(text);
      const wrapper = generic[1];
      if (wrapper === 'Array' || wrapper === 'ReadonlyArray') {
        const item = this.tsTypeExpression(args[0] || 'any', filePath, depth + 1);
        return { schema: { type: 'array', items: item ? item.schema : {} }, optional };
      }
      if (wrapper === 'Record') {
        const value = this.tsTypeExpression(args[1] || 'any', filePath, depth + 1);
        return { schema: { type: 'object', additionalProperties: value ? value.schema : {} }, optional };
      }
      if (wrapper === 'Partial' || wrapper === 'Required' || wrapper === 'Readonly' || wrapper === 'Pick' || wrapper === 'Omit') {
        const inner = this.tsTypeExpression(args[0], filePath, depth + 1);
        if (!inner || inner.schema.type !== 'object') return inner;
        const schema = { ...inner.schema, properties: { ...(inner.schema.properties || {}) }, required: [...(inner.schema.required || [])] };
        if (wrapper === 'Partial') schema.required = [];
        if (wrapper === 'Required') schema.required = Object.keys(schema.properties);
        if (wrapper === 'Pick' || wrapper === 'Omit') {
          const keys = splitTopLevel(args[1] || '', '|').map(unquote);
          const keep = (k: string) => (wrapper === 'Pick' ? keys.includes(k) : !keys.includes(k));
          schema.properties = Object.fromEntries(Object.entries(schema.properties).filter(([k]) => keep(k)));
          schema.required = schema.required.filter(keep);
        }
        return { schema, optional };
      }
      if (/^(?:z\.)?infer$/.test(wrapper) || wrapper === 'z.infer' || wrapper === 'z.input' || wrapper === 'z.output') {
        const typeofMatch = /typeof\s+([A-Za-z_$][\w$.]*)/.exec(args[0] || '');
        if (typeofMatch) {
          const referenced = this.registry.resolve(typeofMatch[1], filePath);
          if (referenced && referenced.kind === 'value') {
            const zod = this.zodField(referenced.text, referenced.filePath, depth + 1);
            if (zod) return zod;
          }
        }
        return { schema: { type: 'object' }, optional };
      }
      if (wrapper === 'Promise') return this.tsTypeExpression(args[0] || 'any', filePath, depth + 1);
      if (wrapper === 'InferType' || wrapper === 'yup.InferType' || wrapper === 'Static') {
        return { schema: { type: 'object' }, optional };
      }
      return { schema: { type: 'object' }, optional };
    }

    if (text.startsWith('{')) {
      const shape = this.tsMembers(balancedSlice(text, 0).slice(1, -1), filePath, false);
      return { schema: { type: 'object', properties: shape.properties, required: shape.required, ...(nullable ? { nullable } : {}) }, optional };
    }
    if (isStringLiteral(text)) return { schema: { type: 'string', enum: [unquote(text)] }, optional };
    if (/^-?\d+(\.\d+)?$/.test(text)) return { schema: { type: 'number', enum: [Number(text)] }, optional };

    const primitive: Record<string, any> = {
      string: { type: 'string' }, number: { type: 'number' }, boolean: { type: 'boolean' }, bigint: { type: 'integer' },
      Date: { type: 'string', format: 'date-time' }, any: {}, unknown: {}, object: { type: 'object' }, Object: { type: 'object' },
      null: { type: 'null' }, void: {}, never: {}, Buffer: { type: 'string', format: 'binary' }, File: { type: 'string', format: 'binary' },
      String: { type: 'string' }, Number: { type: 'number' }, Boolean: { type: 'boolean' },
    };
    if (primitive[text]) return { schema: { ...primitive[text], ...(nullable ? { nullable } : {}) }, optional };

    // A named type: interface / type alias / enum / class / zod schema reference.
    if (/^[A-Za-z_$][\w$.]*$/.test(text)) {
      const def = this.registry.resolve(text, filePath);
      if (def) {
        if (def.kind === 'enum') {
          const values = this.enumValuesFromBody(def.text);
          return { schema: { type: typeof values[0] === 'number' ? 'number' : 'string', enum: values, ...(nullable ? { nullable } : {}) }, optional };
        }
        const nested = this.fromSymbol(text, filePath, depth + 1);
        if (nested) return { schema: { type: 'object', properties: nested.properties, required: nested.required, ...(nullable ? { nullable } : {}) }, optional };
      }
      return { schema: { type: 'object', ...(nullable ? { nullable } : {}) }, optional };
    }
    return { schema: {}, optional };
  }

  /* ------------------------------------------------------------------ *
   * Plain usage: destructuring and property access
   * ------------------------------------------------------------------ */

  private fromUsage(body: string): InferredBody | undefined {
    if (!body) return undefined;
    const cleaned = stripComments(body);
    const properties: Record<string, any> = {};
    const required: string[] = [];
    let source: InferredBody['source'] | null = null;

    // const { name, email = 'x', age: years } = req.body
    const destructuring = /(?:const|let|var)\s*\{([^}]+)\}\s*=\s*req\.body/g;
    let m: RegExpExecArray | null;
    while ((m = destructuring.exec(cleaned)) !== null) {
      source = 'destructuring';
      for (const raw of splitTopLevel(m[1], ',')) {
        const field = raw.split(':')[0].split('=')[0].trim().replace(/^\.\.\./, '');
        if (!field || raw.startsWith('...')) continue;
        properties[field] = { type: this.guessType(field, cleaned, raw) };
        if (/=/.test(raw)) properties[field].default = this.literalValue(raw.split('=').slice(1).join('=').trim());
        if (new RegExp(`!${field}\\b`).test(cleaned) && !/=/.test(raw)) required.push(field);
      }
    }

    // req.body.name / req.body['name'] / req.body?.name
    const access = /req\.body\??\.([A-Za-z_$][\w$]*)|req\.body\[\s*['"]([^'"]+)['"]\s*\]/g;
    while ((m = access.exec(cleaned)) !== null) {
      const field = m[1] || m[2];
      if (properties[field]) continue;
      source = source || 'property-access';
      properties[field] = { type: this.guessType(field, cleaned, `req.body.${field}`) };
      if (new RegExp(`!req\\.body\\??\\.${field}\\b|!req\\.body\\[\\s*['"]${field}['"]\\s*\\]`).test(cleaned)) required.push(field);
    }

    if (!source || Object.keys(properties).length === 0) return undefined;
    return { properties, required, source };
  }

  private guessType(field: string, body: string, expression: string): string {
    const name = field.toLowerCase();
    const esc = expression.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(?:Number|parseInt|parseFloat)\\s*\\(\\s*${esc}`).test(body)) return 'number';
    if (new RegExp(`${esc}\\s*===?\\s*(?:true|false)|Boolean\\s*\\(\\s*${esc}`).test(body)) return 'boolean';
    if (new RegExp(`Array\\.isArray\\s*\\(\\s*${esc}|${esc}\\.(?:map|forEach|length)\\b`).test(body)) return 'array';
    if (/(?:^|_)(?:price|amount|total|quantity|qty|count|age|stock|rating|weight|height|width|lat|lng|latitude|longitude)$/.test(name)) return 'number';
    if (/^(?:is|has)[A-Z_]|_?(?:active|enabled|published|verified|deleted)$/.test(field)) return 'boolean';
    if (/(?:^|_)(?:tags|items|ids|roles|permissions|categories)$/.test(name)) return 'array';
    return 'string';
  }

  /* ------------------------------------------------------------------ *
   * Helpers
   * ------------------------------------------------------------------ */

  private enumValues(name: string, filePath: string): (string | number)[] | null {
    const def = this.registry.resolve(name, filePath);
    if (!def) return null;
    if (def.kind === 'enum') return this.enumValuesFromBody(def.text);
    if (def.kind === 'value' && def.text.trim().startsWith('{')) {
      return objectEntries(balancedSlice(def.text.trim(), 0).slice(1, -1)).map((e) => this.literalValue(e.value)).filter((v) => v !== undefined) as (string | number)[];
    }
    return null;
  }

  private enumValuesFromBody(body: string): (string | number)[] {
    const values: (string | number)[] = [];
    let auto = 0;
    for (const member of splitTopLevel(stripComments(body), ',')) {
      const m = /^([A-Za-z_$][\w$]*)\s*(?:=\s*([\s\S]+))?$/.exec(member.trim());
      if (!m) continue;
      if (m[2]) {
        const value = this.literalValue(m[2]);
        values.push(value === undefined ? m[1] : value);
        if (typeof value === 'number') auto = value + 1;
      } else {
        values.push(auto++);
      }
    }
    return values;
  }

  private mergeUnion(schemas: any[]): any {
    const flat = schemas.filter(Boolean);
    if (flat.length === 0) return {};
    if (flat.every((s) => s.enum && s.type === flat[0].type)) {
      return { type: flat[0].type, enum: flat.flatMap((s) => s.enum) };
    }
    const types = Array.from(new Set(flat.map((s) => s.type).filter(Boolean)));
    if (types.length === 1) return { ...flat[0] };
    return { oneOf: flat };
  }

  private literalValue(raw: string): any {
    const v = raw.trim();
    if (isStringLiteral(v)) return unquote(v);
    if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (v === 'null') return null;
    if (v.startsWith('[')) return splitTopLevel(balancedSlice(v, 0).slice(1, -1), ',').map((x) => this.literalValue(x));
    if (v.startsWith('{')) return Object.fromEntries(objectEntries(balancedSlice(v, 0).slice(1, -1)).filter((e) => !e.spread).map((e) => [e.key, e.shorthand ? undefined : this.literalValue(e.value)]));
    return undefined;
  }

  private setPath(target: Record<string, any>, dottedName: string, schema: any): void {
    const parts = dottedName.replace(/\[\*?\]|\.\*/g, '').split('.').filter(Boolean);
    let cursor = target;
    for (let i = 0; i < parts.length - 1; i++) {
      cursor[parts[i]] = cursor[parts[i]] && cursor[parts[i]].type === 'object' ? cursor[parts[i]] : { type: 'object', properties: {} };
      cursor = cursor[parts[i]].properties;
    }
    cursor[parts[parts.length - 1]] = schema;
  }
}

export type { SymbolDefinition };
