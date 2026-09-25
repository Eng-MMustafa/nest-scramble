/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import { balancedSlice, isStringLiteral, matchBracket, objectEntries, readExpression, splitTopLevel, stripComments, unquote } from './ExpressLexical';
import { ExpressSymbolRegistry } from './ExpressSymbolRegistry';

export interface ResponseContext {
  filePath: string;
  registry: ExpressSymbolRegistry;
}

const REASON: Record<string, string> = {
  '200': 'OK', '201': 'Created', '202': 'Accepted', '204': 'No Content',
  '301': 'Moved Permanently', '302': 'Found', '304': 'Not Modified',
  '400': 'Bad Request', '401': 'Unauthorized', '402': 'Payment Required', '403': 'Forbidden',
  '404': 'Not Found', '405': 'Method Not Allowed', '409': 'Conflict', '410': 'Gone',
  '412': 'Precondition Failed', '413': 'Payload Too Large', '415': 'Unsupported Media Type',
  '422': 'Unprocessable Entity', '429': 'Too Many Requests',
  '500': 'Internal Server Error', '501': 'Not Implemented', '502': 'Bad Gateway', '503': 'Service Unavailable',
};

export interface InferredResponse {
  description: string;
  schema?: any;
  example?: any;
}

/**
 * Documents the responses an Express handler can produce by reading
 * `res.status(404).json({ message: 'User not found' })`-style calls. Object
 * and array literals become schemas (with the literal as example); status codes
 * without a literal payload are still listed with their reason phrase.
 */
export class ExpressResponseInference {
  static infer(handlerBody: string, method: string, context?: ResponseContext): Record<string, InferredResponse> {
    const responses: Record<string, InferredResponse> = {};
    if (!handlerBody) return responses;
    const text = stripComments(handlerBody);
    const scope = { body: text, context };

    // res.status(201).json(...) / res.status(404).send(...) / res.status(204).end()
    const statusPattern = /res\s*\.\s*status\s*\(\s*(\d{3})\s*\)\s*(?:\.\s*(json|send|jsonp|end)\s*\()?/g;
    let m: RegExpExecArray | null;
    while ((m = statusPattern.exec(text)) !== null) {
      const code = m[1];
      const entry = this.ensure(responses, code);
      if (m[2] && m[2] !== 'end') this.applyPayload(entry, this.callArgument(text, m.index + m[0].length - 1), scope);
    }

    // res.sendStatus(204)
    const sendStatus = /res\s*\.\s*sendStatus\s*\(\s*(\d{3})\s*\)/g;
    while ((m = sendStatus.exec(text)) !== null) this.ensure(responses, m[1]);

    // Bare res.json(...) / res.send({...}) — 200 unless the handler is a POST that only creates.
    const bare = /(?<![\w.])res\s*\.\s*(json|send|jsonp)\s*\(/g;
    while ((m = bare.exec(text)) !== null) {
      const before = text.slice(Math.max(0, m.index - 40), m.index);
      if (/status\s*\(\s*\d{3}\s*\)\s*\.?\s*$/.test(before)) continue; // already handled as chained status
      const entry = this.ensure(responses, '200');
      this.applyPayload(entry, this.callArgument(text, m.index + m[0].length - 1), scope);
    }

    // res.redirect('/x') → 302
    if (/res\s*\.\s*redirect\s*\(/.test(text)) this.ensure(responses, '302');
    // res.download / res.sendFile → 200 binary
    if (/res\s*\.\s*(?:download|sendFile)\s*\(/.test(text)) {
      const entry = this.ensure(responses, '200');
      entry.schema = entry.schema || { type: 'string', format: 'binary' };
    }

    if (Object.keys(responses).length === 0) {
      responses[method === 'post' ? '201' : '200'] = { description: REASON[method === 'post' ? '201' : '200'] };
    }
    return responses;
  }

  /** Text of the first argument of the call whose `(` is at `openIndex`. */
  private static callArgument(text: string, openIndex: number): string {
    if (text[openIndex] !== '(') return '';
    const end = matchBracket(text, openIndex);
    if (end === -1) return '';
    const args = splitTopLevel(text.slice(openIndex + 1, end - 1), ',');
    return (args[0] || '').trim();
  }

  private static ensure(responses: Record<string, InferredResponse>, code: string): InferredResponse {
    if (!responses[code]) responses[code] = { description: REASON[code] || 'Response' };
    return responses[code];
  }

  private static applyPayload(entry: InferredResponse, argument: string, scope: { body: string; context?: ResponseContext }): void {
    if (!argument || entry.schema) return;
    const hasSpread = argument.trim().startsWith('{') && /\.\.\./.test(argument);
    const literal = hasSpread
      ? this.identifierSchema(argument, scope, 0)
      : this.literalSchema(argument, 0) || this.identifierSchema(argument, scope, 0);
    if (literal) {
      entry.schema = literal.schema;
      if (literal.example !== undefined) entry.example = literal.example;
    }
  }

  /**
   * `res.json(user)` / `res.json(users)` / `res.json(users.find(...))` —
   * follow the identifier to a local `const x = {...}` or a module-level
   * store like `const users = [{ id: 1, ... }]` (in this file or imported).
   */
  private static identifierSchema(expr: string, scope: { body: string; context?: ResponseContext }, depth: number): { schema: any; example?: any } | null {
    if (depth > 3) return null;
    const value = expr.trim().replace(/^await\s+/, '');

    // cond ? a : b   |   a || b   |   a ?? b  → whichever branch resolves
    const ternary = splitTopLevel(value, '?');
    if (ternary.length === 2 && !value.startsWith('{') && !value.startsWith('[')) {
      const branches = splitTopLevel(ternary[1], ':');
      for (const branch of branches.length === 2 ? [branches[1], branches[0]] : []) {
        const resolved = this.literalSchema(branch, depth + 1) || this.identifierSchema(branch, scope, depth + 1);
        if (resolved) return resolved;
      }
    }
    for (const op of ['||', '??']) {
      const parts = value.includes(op) ? value.split(op).map((p) => p.trim()) : [];
      if (parts.length === 2) {
        for (const part of parts) {
          const resolved = this.literalSchema(part, depth + 1) || this.identifierSchema(part, scope, depth + 1);
          if (resolved) return resolved;
        }
      }
    }

    // users.find(...) / users.filter(...) / users[0] / users.map(...) → element / list of the store
    const chained = /^([A-Za-z_$][\w$]*)\s*(?:\.\s*(find|filter|map|slice|sort|concat|reverse)\s*\(|\[)/.exec(value);
    if (chained) {
      const base = this.identifierSchema(chained[1], scope, depth + 1);
      if (!base || base.schema.type !== 'array') return base;
      const keepsArray = chained[2] && /^(filter|map|slice|sort|concat|reverse)$/.test(chained[2]);
      if (keepsArray) return base;
      return { schema: base.schema.items || {}, example: Array.isArray(base.example) ? base.example[0] : undefined };
    }
    // { ...user, extra } spreads → merge the spread source into the literal
    if (value.startsWith('{') && /\.\.\./.test(value)) {
      const entries = objectEntries(balancedSlice(value, 0).slice(1, -1));
      const merged: Record<string, any> = {};
      const example: Record<string, any> = {};
      let hasExample = false;
      for (const entry of entries) {
        if (entry.spread) {
          const source = this.identifierSchema(entry.key, scope, depth + 1);
          if (source && source.schema.properties) {
            Object.assign(merged, source.schema.properties);
            if (source.example && typeof source.example === 'object') { Object.assign(example, source.example); hasExample = true; }
          }
        } else if (entry.shorthand) {
          merged[entry.key] = { type: this.guessTypeFromName(entry.key) };
        } else {
          const nested = this.literalSchema(entry.value, depth + 1);
          merged[entry.key] = nested ? nested.schema : this.schemaForExpression(entry.key, entry.value);
          if (nested && nested.example !== undefined) { example[entry.key] = nested.example; hasExample = true; }
        }
      }
      return { schema: { type: 'object', properties: merged }, example: hasExample ? example : undefined };
    }
    if (!/^[A-Za-z_$][\w$]*$/.test(value)) return null;

    // Local declaration inside the handler.
    const local = new RegExp(`(?:const|let|var)\\s+${value}\\s*(?::[^=]+)?=(?!=)`).exec(scope.body);
    if (local) {
      const init = readExpression(scope.body, local.index + local[0].length).trim();
      const literal = this.literalSchema(init, depth + 1) || this.identifierSchema(init, scope, depth + 1);
      if (literal) return literal;
    }
    // Module-level / imported store.
    if (scope.context) {
      const def = scope.context.registry.resolve(value, scope.context.filePath);
      if (def && def.kind === 'value') {
        const literal = this.literalSchema(def.text, depth + 1);
        if (literal) return this.trimExample(literal);
      }
    }
    return null;
  }

  /** Stores can be long — keep the first array element as the example. */
  private static trimExample(result: { schema: any; example?: any }): { schema: any; example?: any } {
    if (Array.isArray(result.example) && result.example.length > 2) return { ...result, example: result.example.slice(0, 2) };
    return result;
  }

  /** Object/array/scalar literal → { schema, example }; identifiers → null. */
  private static literalSchema(expr: string, depth: number): { schema: any; example?: any } | null {
    const value = expr.trim();
    if (depth > 4 || !value) return null;

    if (value.startsWith('{')) {
      const entries = objectEntries(balancedSlice(value, 0).slice(1, -1));
      const properties: Record<string, any> = {};
      const example: Record<string, any> = {};
      let hasExample = false;
      for (const entry of entries) {
        if (entry.spread) continue;
        if (entry.shorthand) {
          properties[entry.key] = { type: this.guessTypeFromName(entry.key) };
          continue;
        }
        const nested = this.literalSchema(entry.value, depth + 1);
        if (nested) {
          properties[entry.key] = nested.schema;
          if (nested.example !== undefined) { example[entry.key] = nested.example; hasExample = true; }
        } else {
          properties[entry.key] = this.schemaForExpression(entry.key, entry.value);
        }
      }
      return { schema: { type: 'object', properties }, example: hasExample ? example : undefined };
    }

    if (value.startsWith('[')) {
      const items = splitTopLevel(balancedSlice(value, 0).slice(1, -1), ',');
      const first = items[0] ? this.literalSchema(items[0], depth + 1) : null;
      return { schema: { type: 'array', items: first ? first.schema : {} }, example: first && first.example !== undefined ? [first.example] : undefined };
    }

    if (isStringLiteral(value)) return { schema: { type: 'string' }, example: value.startsWith('`') ? undefined : unquote(value) };
    if (/^-?\d+(\.\d+)?$/.test(value)) return { schema: { type: value.includes('.') ? 'number' : 'integer' }, example: Number(value) };
    if (/^(true|false)$/.test(value)) return { schema: { type: 'boolean' }, example: value === 'true' };
    if (value === 'null') return { schema: { nullable: true }, example: null };
    return null;
  }

  /** Non-literal expression (`user.id`, `Date.now()`, `items.length`) → best-effort type. */
  private static schemaForExpression(key: string, expr: string): any {
    if (/\.length$|Date\.now\(\)|Number\(|parseInt\(|parseFloat\(|Math\./.test(expr)) return { type: 'number' };
    if (/^!|Boolean\(|===|!==/.test(expr)) return { type: 'boolean' };
    if (/\.map\(|\.filter\(|Array\.from|\.slice\(/.test(expr)) return { type: 'array', items: {} };
    if (/new Date|toISOString\(\)/.test(expr)) return { type: 'string', format: 'date-time' };
    if (/\.\w+Id$|\.id$/.test(expr)) return { type: 'string' };
    return { type: this.guessTypeFromName(key) };
  }

  private static guessTypeFromName(key: string): string {
    const k = key.toLowerCase();
    if (/(^|_)(id|count|total|price|amount|quantity|age|page|limit|offset|size)$/.test(k)) return 'number';
    if (/^(is|has)[a-z_]|(^|_)(active|enabled|success|ok|deleted|published)$/.test(k)) return 'boolean';
    if (/(^|_)(items|data|results|list|tags|ids|users|orders|products)$/.test(k)) return 'array';
    return 'string';
  }
}
