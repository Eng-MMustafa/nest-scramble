/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/

/**
 * Tiny lexical helpers for the heuristic Express scanners. They understand
 * strings, template literals, comments and bracket nesting — enough to slice
 * JavaScript/TypeScript source reliably without a full parser (and without a
 * runtime dependency).
 */

const OPEN = new Set(['(', '[', '{']);
const CLOSE: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

/**
 * Returns the index just past the bracket that closes the one at `openIndex`,
 * or -1 when unbalanced. Skips strings, template literals and comments.
 */
export function matchBracket(src: string, openIndex: number): number {
  const stack: string[] = [];
  let i = openIndex;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];

    if (ch === '/' && next === '/') { i = skipLineComment(src, i); continue; }
    if (ch === '/' && next === '*') { i = skipBlockComment(src, i); continue; }
    if (ch === '"' || ch === "'" || ch === '`') { i = skipString(src, i); continue; }

    if (OPEN.has(ch)) stack.push(ch);
    else if (CLOSE[ch]) {
      if (stack[stack.length - 1] !== CLOSE[ch]) return -1;
      stack.pop();
      if (stack.length === 0) return i + 1;
    }
    i++;
  }
  return -1;
}

/** Substring from `openIndex` through its matching close bracket (inclusive). */
export function balancedSlice(src: string, openIndex: number): string {
  const end = matchBracket(src, openIndex);
  return end === -1 ? src.slice(openIndex) : src.slice(openIndex, end);
}

/** Splits `src` on `separator` at nesting depth 0 (angle brackets included). */
export function splitTopLevel(src: string, separator = ','): string[] {
  const parts: string[] = [];
  let depth = 0;
  let angle = 0;
  let start = 0;
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    if (ch === '/' && next === '/') { i = skipLineComment(src, i); continue; }
    if (ch === '/' && next === '*') { i = skipBlockComment(src, i); continue; }
    if (ch === '"' || ch === "'" || ch === '`') { i = skipString(src, i); continue; }
    if (OPEN.has(ch)) depth++;
    else if (CLOSE[ch]) depth--;
    else if (ch === '<' && depth === 0 && /[\w\s>]/.test(next || '')) angle++;
    else if (ch === '>' && angle > 0 && src[i - 1] !== '=') angle--;
    else if (ch === separator && depth === 0 && angle === 0) {
      parts.push(src.slice(start, i));
      start = i + 1;
    }
    i++;
  }
  parts.push(src.slice(start));
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

export interface ObjectEntry {
  key: string;
  value: string;
  /** `{ name }` shorthand or a spread — no explicit value expression. */
  shorthand: boolean;
  spread: boolean;
}

/**
 * Parses the entries of an object literal body (the text between `{` and `}`).
 * Handles quoted keys, computed keys, shorthand properties, methods and
 * spreads; nested structures stay intact in `value`.
 */
export function objectEntries(inner: string): ObjectEntry[] {
  return splitTopLevel(stripComments(inner), ',').map((part) => {
    if (part.startsWith('...')) return { key: part.slice(3).trim(), value: '', shorthand: false, spread: true };
    const colon = topLevelIndexOf(part, ':');
    if (colon === -1) {
      const method = /^(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/.exec(part);
      return { key: (method ? method[1] : part).trim(), value: '', shorthand: true, spread: false };
    }
    const key = part.slice(0, colon).trim().replace(/^\?/, '');
    return {
      key: key.replace(/^['"`]|['"`]$/g, '').replace(/^\[(.*)\]$/, '$1'),
      value: part.slice(colon + 1).trim(),
      shorthand: false,
      spread: false,
    };
  }).filter((e) => e.key.length > 0);
}

/** Index of `needle` at depth 0, skipping strings; -1 when absent. */
export function topLevelIndexOf(src: string, needle: string): number {
  let depth = 0;
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === '`') { i = skipString(src, i); continue; }
    if (OPEN.has(ch) || ch === '<') depth++;
    else if (CLOSE[ch] || ch === '>') depth = Math.max(0, depth - 1);
    else if (depth === 0 && src.startsWith(needle, i)) return i;
    i++;
  }
  return -1;
}

/**
 * Reads one expression starting at `start`: stops at a `;` at depth 0, or at a
 * newline at depth 0 that is followed by the start of a new statement.
 */
export function readExpression(src: string, start: number): string {
  let depth = 0;
  let i = start;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    if (ch === '/' && next === '/') { i = skipLineComment(src, i); continue; }
    if (ch === '/' && next === '*') { i = skipBlockComment(src, i); continue; }
    if (ch === '"' || ch === "'" || ch === '`') { i = skipString(src, i); continue; }
    if (OPEN.has(ch)) depth++;
    else if (CLOSE[ch]) { depth--; if (depth < 0) return src.slice(start, i); }
    else if (depth === 0) {
      if (ch === ';') return src.slice(start, i);
      if (ch === '\n') {
        const rest = src.slice(i + 1, i + 200);
        if (/^\s*(?:export\s+|const\s|let\s|var\s|function\s|async\s+function|class\s|interface\s|type\s|enum\s|import\s|module\.exports|app\.|router\.|server\.|\/\/|\/\*|\}|$)/.test(rest)) {
          return src.slice(start, i);
        }
      }
    }
    i++;
  }
  return src.slice(start);
}

/** Splits a method chain `a.b(c).d(e)` into its call segments. */
export function chainSegments(expr: string): { name: string; args: string }[] {
  const segments: { name: string; args: string }[] = [];
  let i = 0;
  const src = expr.trim();
  // Leading identifier path, e.g. `z.coerce.number` or `Joi.string`.
  const head = /^[A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*/.exec(src);
  if (!head) return segments;
  i = head[0].length;
  let name = head[0].replace(/\s+/g, '');
  while (i <= src.length) {
    while (i < src.length && /\s/.test(src[i])) i++;
    if (src[i] === '(') {
      const end = matchBracket(src, i);
      if (end === -1) break;
      segments.push({ name, args: src.slice(i + 1, end - 1) });
      i = end;
    } else if (segments.length === 0) {
      segments.push({ name, args: '' });
    }
    while (i < src.length && /\s/.test(src[i])) i++;
    if (src[i] === '.') {
      i++;
      const ident = /^\s*([A-Za-z_$][\w$]*)/.exec(src.slice(i));
      if (!ident) break;
      name = ident[1];
      i += ident[0].length;
    } else {
      break;
    }
  }
  return segments;
}

/** Splits `Foo<A, B<C>, D>` into `['A', 'B<C>', 'D']`; `[]` when no generics. */
export function genericArgs(src: string): string[] {
  const open = src.indexOf('<');
  if (open === -1) return [];
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '<') depth++;
    else if (src[i] === '>') {
      depth--;
      if (depth === 0) return splitTopLevel(src.slice(open + 1, i), ',');
    }
  }
  return [];
}

export function stripComments(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    if (ch === '/' && next === '/') { i = skipLineComment(src, i); out += '\n'; continue; }
    if (ch === '/' && next === '*') { i = skipBlockComment(src, i); continue; }
    if (ch === '"' || ch === "'" || ch === '`') { const end = skipString(src, i); out += src.slice(i, end); i = end; continue; }
    out += ch;
    i++;
  }
  return out;
}

export function unquote(value: string): string {
  const v = value.trim();
  return /^(['"`]).*\1$/s.test(v) ? v.slice(1, -1) : v;
}

export function isStringLiteral(value: string): boolean {
  return /^(['"`]).*\1$/s.test(value.trim());
}

function skipString(src: string, i: number): number {
  const quote = src[i];
  i++;
  while (i < src.length) {
    if (src[i] === '\\') { i += 2; continue; }
    if (quote === '`' && src[i] === '$' && src[i + 1] === '{') {
      const end = matchBracket(src, i + 1);
      i = end === -1 ? src.length : end;
      continue;
    }
    if (src[i] === quote) return i + 1;
    i++;
  }
  return src.length;
}

function skipLineComment(src: string, i: number): number {
  const end = src.indexOf('\n', i);
  return end === -1 ? src.length : end;
}

function skipBlockComment(src: string, i: number): number {
  const end = src.indexOf('*/', i + 2);
  return end === -1 ? src.length : end + 2;
}
