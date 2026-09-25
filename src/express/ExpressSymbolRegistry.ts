/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import * as fs from 'fs';
import * as path from 'path';
import { balancedSlice, readExpression } from './ExpressLexical';

export type SymbolKind = 'value' | 'interface' | 'type' | 'class' | 'enum';

export interface SymbolDefinition {
  name: string;
  kind: SymbolKind;
  /** Expression text for values/types, body text (inside braces) for interface/class/enum. */
  text: string;
  /** `interface X extends A, B` parents. */
  extends?: string[];
  filePath: string;
}

interface FileInfo {
  text: string;
  /** local name → { source file, exported name } */
  imports: Map<string, { file: string; name: string }>;
  /** namespace local → source file (import * as ns) */
  namespaces: Map<string, string>;
  /** `export { X } from './y'` re-exports: exported name → { file, name } */
  reexports: Map<string, { file: string; name: string }>;
  reexportAll: string[];
}

/**
 * Resolves identifiers (schemas, DTO interfaces, enums) across an Express
 * project by following ES/CommonJS imports. Files are read lazily and cached.
 */
export class ExpressSymbolRegistry {
  private files = new Map<string, FileInfo>();

  /** Looks `name` (may be dotted: `schemas.CreateUser`) up starting in `fromFile`. */
  resolve(name: string, fromFile: string, depth = 0): SymbolDefinition | null {
    if (depth > 6 || !name) return null;
    const info = this.load(fromFile);
    if (!info) return null;

    const dot = name.indexOf('.');
    if (dot !== -1) {
      const ns = name.slice(0, dot);
      const rest = name.slice(dot + 1);
      const nsFile = info.namespaces.get(ns);
      if (nsFile) return this.resolveExported(rest, nsFile, depth + 1);
      // `Schemas.CreateUser` where Schemas is a plain object literal in scope.
      const container = this.resolve(ns, fromFile, depth + 1);
      if (container && container.kind === 'value') {
        const inner = this.memberOfObjectLiteral(container.text, rest);
        if (inner) return { name: rest, kind: 'value', text: inner, filePath: container.filePath };
      }
      return null;
    }

    const local = this.findInFile(name, info.text, fromFile);
    if (local) return local;

    const imported = info.imports.get(name);
    if (imported) return this.resolveExported(imported.name, imported.file, depth + 1);
    return null;
  }

  private resolveExported(name: string, file: string, depth: number): SymbolDefinition | null {
    if (depth > 6) return null;
    const info = this.load(file);
    if (!info) return null;
    const local = this.findInFile(name === 'default' ? this.defaultExportName(info.text) || name : name, info.text, file);
    if (local) return local;
    const re = info.reexports.get(name);
    if (re) return this.resolveExported(re.name, re.file, depth + 1);
    for (const barrel of info.reexportAll) {
      const found = this.resolveExported(name, barrel, depth + 1);
      if (found) return found;
    }
    const imported = info.imports.get(name);
    if (imported) return this.resolveExported(imported.name, imported.file, depth + 1);
    return null;
  }

  private findInFile(name: string, text: string, filePath: string): SymbolDefinition | null {
    const esc = name.replace(/[$]/g, '\\$');

    const iface = new RegExp(`(?:^|\\n)\\s*(?:export\\s+)?interface\\s+${esc}\\b(?:\\s*<[^{]*>)?(?:\\s+extends\\s+([^{]+))?\\s*\\{`).exec(text);
    if (iface) {
      const open = text.indexOf('{', iface.index + iface[0].length - 1);
      const block = balancedSlice(text, open);
      const parents = iface[1] ? iface[1].split(',').map((s) => s.trim().replace(/<.*$/, '')).filter(Boolean) : undefined;
      return { name, kind: 'interface', text: block.slice(1, -1), extends: parents, filePath };
    }

    const typeAlias = new RegExp(`(?:^|\\n)\\s*(?:export\\s+)?type\\s+${esc}\\b(?:\\s*<[^=]*>)?\\s*=`).exec(text);
    if (typeAlias) {
      const start = typeAlias.index + typeAlias[0].length;
      return { name, kind: 'type', text: readExpression(text, start).trim(), filePath };
    }

    const enumDecl = new RegExp(`(?:^|\\n)\\s*(?:export\\s+)?(?:const\\s+)?enum\\s+${esc}\\s*\\{`).exec(text);
    if (enumDecl) {
      const open = text.indexOf('{', enumDecl.index + enumDecl[0].length - 1);
      return { name, kind: 'enum', text: balancedSlice(text, open).slice(1, -1), filePath };
    }

    const classDecl = new RegExp(`(?:^|\\n)\\s*(?:export\\s+)?(?:default\\s+)?(?:abstract\\s+)?class\\s+${esc}\\b[^{]*\\{`).exec(text);
    if (classDecl) {
      const open = text.indexOf('{', classDecl.index + classDecl[0].length - 1);
      const parents = /extends\s+([A-Za-z_$][\w$.]*)/.exec(classDecl[0]);
      return { name, kind: 'class', text: balancedSlice(text, open).slice(1, -1), extends: parents ? [parents[1]] : undefined, filePath };
    }

    const value = this.findLocalValue(name, text, filePath, true);
    if (value) return value;

    // CommonJS: exports.X = ... / module.exports.X = ...
    const cjs = new RegExp(`(?:module\\.)?exports\\.${esc}\\s*=(?!=)`).exec(text);
    if (cjs) {
      const start = cjs.index + cjs[0].length;
      return { name, kind: 'value', text: readExpression(text, start).trim(), filePath };
    }

    // module.exports = { X, Y: ... }
    const cjsObject = /module\.exports\s*=\s*\{/.exec(text);
    if (cjsObject) {
      const open = text.indexOf('{', cjsObject.index + cjsObject[0].length - 1);
      const member = this.memberOfObjectLiteral(balancedSlice(text, open), name);
      if (member) {
        // `{ X }` shorthand points at a local declaration.
        if (member === name) {
          const localDecl = this.findLocalValue(name, text, filePath);
          if (localDecl) return localDecl;
        }
        return { name, kind: 'value', text: member, filePath };
      }
    }
    return null;
  }

  /**
   * Finds `const NAME = …` declared at module level. "Module level" is the
   * file's base indentation, so an indented `const user = …` inside a handler
   * is never mistaken for a shared store of the same name, while files whose
   * every line is indented (embedded snippets) still work.
   */
  private findLocalValue(name: string, text: string, filePath: string, allowExport = false): SymbolDefinition | null {
    const esc = name.replace(/[$]/g, '\\$');
    const base = this.moduleIndent(text);
    const pattern = new RegExp(`(?:^|\\n)([ \\t]*)${allowExport ? '(?:export\\s+)?' : ''}(?:const|let|var)\\s+${esc}\\s*(?::[^=]+)?=(?!=)`, 'g');
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      if (m[1].length !== base) continue;
      return { name, kind: 'value', text: readExpression(text, m.index + m[0].length).trim(), filePath };
    }
    return null;
  }

  private moduleIndent(text: string): number {
    let min = Infinity;
    for (const line of text.split('\n')) {
      if (!line.trim() || /^\s*(\/\/|\*|\/\*)/.test(line)) continue;
      const indent = /^[ \t]*/.exec(line)![0].length;
      if (indent < min) min = indent;
      if (min === 0) break;
    }
    return min === Infinity ? 0 : min;
  }

  private memberOfObjectLiteral(objectText: string, member: string): string | null {
    const trimmed = objectText.trim();
    if (!trimmed.startsWith('{')) return null;
    const inner = balancedSlice(trimmed, 0).slice(1, -1);
    const esc = member.replace(/[$]/g, '\\$');
    const match = new RegExp(`(?:^|,|\\n)\\s*(?:['"])?${esc}(?:['"])?\\s*:`).exec(inner);
    if (match) return readExpression(inner, match.index + match[0].length).replace(/,\s*$/, '').trim();
    const shorthand = new RegExp(`(?:^|,|\\n)\\s*${esc}\\s*(?=,|\\n|$)`).exec(inner);
    return shorthand ? member : null;
  }

  private defaultExportName(text: string): string | null {
    const m = /export\s+default\s+([A-Za-z_$][\w$]*)\s*;?\s*$/m.exec(text) || /module\.exports\s*=\s*([A-Za-z_$][\w$]*)\s*;?/.exec(text);
    return m ? m[1] : null;
  }

  private load(filePath: string): FileInfo | null {
    const cached = this.files.get(filePath);
    if (cached) return cached;
    let text: string;
    try {
      text = fs.readFileSync(filePath, 'utf-8');
    } catch {
      return null;
    }
    const info = this.index(text, filePath);
    this.files.set(filePath, info);
    return info;
  }

  private index(text: string, filePath: string): FileInfo {
    const imports = new Map<string, { file: string; name: string }>();
    const namespaces = new Map<string, string>();
    const reexports = new Map<string, { file: string; name: string }>();
    const reexportAll: string[] = [];
    let m: RegExpExecArray | null;

    // import X, { A, B as C } from './y'   |   import * as ns from './y'
    const esImport = /import\s+(?:type\s+)?([^'"`;]+?)\s+from\s+['"`]([^'"`]+)['"`]/g;
    while ((m = esImport.exec(text)) !== null) {
      const file = this.resolveFile(m[2], filePath);
      if (!file) continue;
      const clause = m[1].trim();
      const ns = /\*\s+as\s+([A-Za-z_$][\w$]*)/.exec(clause);
      if (ns) namespaces.set(ns[1], file);
      const def = /^([A-Za-z_$][\w$]*)\s*(?:,|$)/.exec(clause);
      if (def) imports.set(def[1], { file, name: 'default' });
      const named = /\{([^}]*)\}/.exec(clause);
      if (named) {
        for (const spec of named[1].split(',')) {
          const parts = spec.trim().replace(/^type\s+/, '').split(/\s+as\s+/);
          if (parts[0]) imports.set((parts[1] || parts[0]).trim(), { file, name: parts[0].trim() });
        }
      }
    }

    // export { A, B as C } from './y'   |   export * from './y'
    const esReexport = /export\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"`]([^'"`]+)['"`]/g;
    while ((m = esReexport.exec(text)) !== null) {
      const file = this.resolveFile(m[2], filePath);
      if (!file) continue;
      for (const spec of m[1].split(',')) {
        const parts = spec.trim().split(/\s+as\s+/);
        if (parts[0]) reexports.set((parts[1] || parts[0]).trim(), { file, name: parts[0].trim() });
      }
    }
    const esExportAll = /export\s+\*\s+from\s+['"`]([^'"`]+)['"`]/g;
    while ((m = esExportAll.exec(text)) !== null) {
      const file = this.resolveFile(m[1], filePath);
      if (file) reexportAll.push(file);
    }

    // const { A, B: C } = require('./y')   |   const ns = require('./y')
    const cjsDestructure = /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
    while ((m = cjsDestructure.exec(text)) !== null) {
      const file = this.resolveFile(m[2], filePath);
      if (!file) continue;
      for (const spec of m[1].split(',')) {
        const parts = spec.trim().split(/\s*:\s*/);
        if (parts[0]) imports.set((parts[1] || parts[0]).trim(), { file, name: parts[0].trim() });
      }
    }
    const cjsNamespace = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
    while ((m = cjsNamespace.exec(text)) !== null) {
      const file = this.resolveFile(m[2], filePath);
      if (file) {
        namespaces.set(m[1], file);
        imports.set(m[1], { file, name: 'default' });
      }
    }

    return { text, imports, namespaces, reexports, reexportAll };
  }

  private resolveFile(importPath: string, fromFile: string): string | null {
    if (!importPath.startsWith('.')) return null;
    const base = path.resolve(path.dirname(fromFile), importPath);
    const candidates = [
      base, `${base}.ts`, `${base}.js`, `${base}.mjs`, `${base}.cjs`, `${base}.tsx`,
      path.join(base, 'index.ts'), path.join(base, 'index.js'),
    ];
    for (const candidate of candidates) {
      try {
        if (fs.statSync(candidate).isFile()) return candidate;
      } catch { /* try next */ }
    }
    return null;
  }
}
