/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import * as fs from 'fs';
import * as path from 'path';
import { friendlyNames } from './ExpressNaming';

export interface ExpressGraphQLArg {
  name: string;
  required: boolean;
  schema: any;
  graphqlType: string;
  description?: string;
}

export interface ExpressGraphQLOperation {
  name: string;
  kind: 'query' | 'mutation' | 'subscription';
  summary: string;
  sample: string;
  args?: ExpressGraphQLArg[];
  response?: any;
  description?: string;
  /** Wire type of the field, e.g. `[Post!]!`. */
  returnType?: string;
}

export interface ExpressGraphQLResolver {
  name: string;
  filePath: string;
  operations: ExpressGraphQLOperation[];
  /** `graphql` when the project's own parser was used, `regex` otherwise. */
  parser?: 'graphql' | 'regex';
}

interface FieldDef {
  name: string;
  type: string;
  description?: string;
  args: { name: string; type: string; description?: string; defaultValue?: string }[];
}

interface TypeDef {
  kind: 'object' | 'input' | 'interface' | 'union' | 'enum' | 'scalar';
  name: string;
  description?: string;
  fields: FieldDef[];
  enumValues: string[];
  unionMembers: string[];
}

interface SdlModel {
  types: Map<string, TypeDef>;
  roots: { query: string; mutation: string; subscription: string };
  parser: 'graphql' | 'regex';
}

const IGNORED_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', 'test', 'tests', '__tests__']);

const SCALAR_SCHEMAS: Record<string, any> = {
  String: { type: 'string' }, ID: { type: 'string' }, Int: { type: 'integer' }, Float: { type: 'number' }, Boolean: { type: 'boolean' },
  DateTime: { type: 'string', format: 'date-time' }, Date: { type: 'string', format: 'date' }, Time: { type: 'string', format: 'time' },
  JSON: { type: 'object' }, JSONObject: { type: 'object' }, Upload: { type: 'string', format: 'binary' }, UUID: { type: 'string', format: 'uuid' },
  EmailAddress: { type: 'string', format: 'email' }, URL: { type: 'string', format: 'uri' }, BigInt: { type: 'integer' }, Long: { type: 'integer' },
};

/**
 * Scanner for GraphQL schemas in Express/Node.js projects.
 *
 * SDL is collected from `.graphql`/`.gql` files and from template literals
 * passed to `buildSchema`, `gql`, `makeExecutableSchema({ typeDefs })` or
 * assigned to `typeDefs`. When the project has the `graphql` package (it does
 * if it serves GraphQL) its real parser is used, so interfaces, unions, enums,
 * descriptions and multi-line arguments are all handled; otherwise a tolerant
 * regex parser takes over. Either way the result is a type registry from which
 * runnable sample operations, variable schemas and response shapes are built.
 */
export class ExpressGraphQLScanner {
  static scan(sourcePath: string): ExpressGraphQLResolver[] {
    const absolutePath = path.resolve(sourcePath);
    if (!fs.existsSync(absolutePath)) return [];

    const graphql = this.loadGraphqlPackage(absolutePath);
    const found: { file: string; operations: ExpressGraphQLOperation[]; parser: 'graphql' | 'regex' }[] = [];

    for (const file of this.collectFiles(absolutePath)) {
      const text = fs.readFileSync(file, 'utf-8');
      const sdl = this.extractSdl(text, file);
      if (!sdl) continue;

      const model = this.buildModel(sdl, graphql);
      const operations = this.operationsFrom(model);
      if (operations.length > 0) found.push({ file, operations, parser: model.parser });
    }

    // A lone `schema.js`/`typeDefs.ts` is simply the project's GraphQL API;
    // named schema files (`posts.graphql`) read as `PostsResolver`.
    const names = friendlyNames(found.map((f) => f.file));
    return found.map(({ file, operations, parser }) => {
      const name = names.get(file) || path.basename(file, path.extname(file));
      const generic = /^(Schema|Typedefs|TypeDefs|Graphql|GraphQL|Sdl)$/i.test(name);
      return { name: generic ? 'GraphQL' : `${name}Resolver`, filePath: file, operations, parser };
    });
  }

  /* ------------------------------------------------------------------ *
   * File discovery + SDL extraction
   * ------------------------------------------------------------------ */

  private static collectFiles(dir: string, out: string[] = [], depth = 0): string[] {
    if (depth > 8) return out;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return out;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) this.collectFiles(full, out, depth + 1);
      } else if (entry.isFile() && /\.(js|ts|mjs|cjs|graphql|gql)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
        out.push(full);
      }
    }
    return out;
  }

  private static extractSdl(text: string, filePath: string): string {
    if (/\.(graphql|gql)$/.test(filePath)) return text;

    const chunks: string[] = [];
    // buildSchema(`…`), gql`…`, typeDefs = `…`, typeDefs: `…`, makeExecutableSchema({ typeDefs: `…` })
    const openers = /(?:buildSchema\s*\(\s*|\bgql\s*(?:\(\s*)?|typeDefs\s*[:=]\s*|#graphql\s*)(`)/g;
    let m: RegExpExecArray | null;
    while ((m = openers.exec(text)) !== null) {
      const start = m.index + m[0].length;
      const end = this.templateEnd(text, start);
      if (end === -1) continue;
      const chunk = text.slice(start, end).replace(/\$\{[^}]*\}/g, '');
      if (/\b(type|input|enum|interface|union|schema|extend)\s+\w*/.test(chunk)) chunks.push(chunk);
      openers.lastIndex = end;
    }
    // Plain string variants: buildSchema("…") / '…' (single line, rare)
    const quoted = /buildSchema\s*\(\s*(['"])([\s\S]*?)\1\s*\)/.exec(text);
    if (quoted && chunks.length === 0) chunks.push(quoted[2]);

    return chunks.join('\n');
  }

  private static templateEnd(text: string, start: number): number {
    for (let i = start; i < text.length; i++) {
      if (text[i] === '\\') { i++; continue; }
      if (text[i] === '`') return i;
    }
    return -1;
  }

  /* ------------------------------------------------------------------ *
   * SDL → type registry (graphql package first, regex fallback)
   * ------------------------------------------------------------------ */

  private static loadGraphqlPackage(fromDir: string): any | null {
    let dir = fromDir;
    for (let i = 0; i < 6; i++) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require(require.resolve('graphql', { paths: [dir] }));
      } catch {
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
      }
    }
    return null;
  }

  private static buildModel(sdl: string, graphql: any | null): SdlModel {
    if (graphql) {
      try {
        return this.modelFromAst(graphql.parse(sdl, { noLocation: true }), graphql);
      } catch {
        /* syntax error or unsupported feature — fall back to the regex parser */
      }
    }
    return this.modelFromRegex(sdl);
  }

  private static emptyModel(parser: 'graphql' | 'regex'): SdlModel {
    return { types: new Map(), roots: { query: 'Query', mutation: 'Mutation', subscription: 'Subscription' }, parser };
  }

  private static modelFromAst(doc: any, graphql: any): SdlModel {
    const model = this.emptyModel('graphql');
    const typeString = (node: any): string => graphql.print(node);
    const description = (node: any): string | undefined => (node.description && node.description.value) || undefined;
    const ensure = (name: string, kind: TypeDef['kind'], desc?: string): TypeDef => {
      const existing = model.types.get(name);
      if (existing) { if (desc && !existing.description) existing.description = desc; return existing; }
      const created: TypeDef = { kind, name, description: desc, fields: [], enumValues: [], unionMembers: [] };
      model.types.set(name, created);
      return created;
    };
    const fieldsOf = (nodes: any[] = []): FieldDef[] => nodes.map((f: any) => ({
      name: f.name.value,
      type: typeString(f.type),
      description: description(f),
      args: (f.arguments || []).map((a: any) => ({
        name: a.name.value,
        type: typeString(a.type),
        description: description(a),
        defaultValue: a.defaultValue ? graphql.print(a.defaultValue) : undefined,
      })),
    }));

    for (const def of doc.definitions) {
      switch (def.kind) {
        case 'SchemaDefinition': case 'SchemaExtension':
          for (const op of def.operationTypes || []) (model.roots as any)[op.operation] = op.type.name.value;
          break;
        case 'ObjectTypeDefinition': case 'ObjectTypeExtension':
          ensure(def.name.value, 'object', description(def)).fields.push(...fieldsOf(def.fields));
          break;
        case 'InterfaceTypeDefinition': case 'InterfaceTypeExtension':
          ensure(def.name.value, 'interface', description(def)).fields.push(...fieldsOf(def.fields));
          break;
        case 'InputObjectTypeDefinition': case 'InputObjectTypeExtension':
          ensure(def.name.value, 'input', description(def)).fields.push(...fieldsOf(def.fields));
          break;
        case 'EnumTypeDefinition': case 'EnumTypeExtension':
          ensure(def.name.value, 'enum', description(def)).enumValues.push(...(def.values || []).map((v: any) => v.name.value));
          break;
        case 'UnionTypeDefinition': case 'UnionTypeExtension':
          ensure(def.name.value, 'union', description(def)).unionMembers.push(...(def.types || []).map((t: any) => t.name.value));
          break;
        case 'ScalarTypeDefinition':
          ensure(def.name.value, 'scalar', description(def));
          break;
        default: break;
      }
    }
    return model;
  }

  private static modelFromRegex(rawSdl: string): SdlModel {
    const model = this.emptyModel('regex');
    // Strip block/inline descriptions and # comments so they cannot confuse the field regex.
    const sdl = rawSdl.replace(/"""[\s\S]*?"""/g, '').replace(/"[^"\n]*"/g, '').replace(/#[^\n]*/g, '');

    const schemaBlock = /schema\s*\{([^}]*)\}/.exec(sdl);
    if (schemaBlock) {
      for (const m of schemaBlock[1].matchAll(/(query|mutation|subscription)\s*:\s*(\w+)/g)) (model.roots as any)[m[1]] = m[2];
    }

    const blockPattern = /(?:extend\s+)?(type|input|interface|enum)\s+(\w+)(?:\s+implements\s+[\w\s&]+)?\s*\{([^}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = blockPattern.exec(sdl)) !== null) {
      const kind = m[1] === 'type' ? 'object' : (m[1] as TypeDef['kind']);
      const name = m[2];
      const body = m[3];
      const def = model.types.get(name) || { kind, name, fields: [], enumValues: [], unionMembers: [] };
      model.types.set(name, def);

      if (kind === 'enum') {
        def.enumValues.push(...body.split(/\s+/).map((v) => v.trim()).filter((v) => /^\w+$/.test(v)));
        continue;
      }
      // fieldName(args…): Type  — args may span lines
      const fieldPattern = /(\w+)\s*(?:\(([^)]*)\))?\s*:\s*([\w[\]!]+)(?:\s*=\s*[^\n,]+)?/g;
      let f: RegExpExecArray | null;
      while ((f = fieldPattern.exec(body)) !== null) {
        const args = (f[2] || '').split(/,|\n/).map((a) => a.trim()).filter(Boolean).map((a) => {
          const am = /(\w+)\s*:\s*([\w[\]!]+)(?:\s*=\s*(.+))?/.exec(a);
          return am ? { name: am[1], type: am[2], defaultValue: am[3] ? am[3].trim() : undefined } : null;
        }).filter(Boolean) as FieldDef['args'];
        def.fields.push({ name: f[1], type: f[3], args });
      }
    }

    const unionPattern = /union\s+(\w+)\s*=\s*([\w\s|]+)/g;
    while ((m = unionPattern.exec(sdl)) !== null) {
      model.types.set(m[1], { kind: 'union', name: m[1], fields: [], enumValues: [], unionMembers: m[2].split('|').map((s) => s.trim()).filter(Boolean) });
    }
    const scalarPattern = /scalar\s+(\w+)/g;
    while ((m = scalarPattern.exec(sdl)) !== null) {
      if (!model.types.has(m[1])) model.types.set(m[1], { kind: 'scalar', name: m[1], fields: [], enumValues: [], unionMembers: [] });
    }
    return model;
  }

  /* ------------------------------------------------------------------ *
   * Registry → operations (samples, variable schemas, response shapes)
   * ------------------------------------------------------------------ */

  private static operationsFrom(model: SdlModel): ExpressGraphQLOperation[] {
    const operations: ExpressGraphQLOperation[] = [];
    const kinds: ('query' | 'mutation' | 'subscription')[] = ['query', 'mutation', 'subscription'];

    for (const kind of kinds) {
      const root = model.types.get(model.roots[kind]);
      if (!root) continue;
      for (const field of root.fields) {
        const args: ExpressGraphQLArg[] = field.args.map((a) => ({
          name: a.name,
          required: a.type.endsWith('!') && a.defaultValue === undefined,
          schema: this.schemaFor(a.type, model, 0),
          graphqlType: a.type,
          description: a.description,
        }));
        const selection = this.selectionFor(field.type, model, 0);
        const varDefs = args.length ? `(${args.map((a) => `$${a.name}: ${a.graphqlType}`).join(', ')})` : '';
        const argInline = args.length ? `(${args.map((a) => `${a.name}: $${a.name}`).join(', ')})` : '';
        const sample = args.length
          ? `${kind} ${field.name}${varDefs} { ${field.name}${argInline}${selection} }`
          : `${kind} { ${field.name}${selection} }`;
        const label = kind.charAt(0).toUpperCase() + kind.slice(1);

        operations.push({
          name: field.name,
          kind,
          summary: field.description ? field.description.split('\n')[0] : `${label} ${field.name}`,
          description: field.description,
          sample,
          args,
          returnType: field.type,
          response: this.schemaFor(field.type, model, 0),
        });
      }
    }
    return operations;
  }

  /** `{ id title author { id name } }` for object results; empty for scalars. */
  private static selectionFor(graphqlType: string, model: SdlModel, depth: number): string {
    const def = model.types.get(this.unwrap(graphqlType));
    if (!def || depth > 2) return '';
    if (def.kind === 'union') {
      const fragments = def.unionMembers.slice(0, 3).map((member) => `... on ${member}${this.selectionFor(member, model, depth + 1) || ' { __typename }'}`);
      return ` { __typename ${fragments.join(' ')} }`;
    }
    if (def.kind !== 'object' && def.kind !== 'interface') return '';
    const picked: string[] = [];
    for (const field of def.fields) {
      if (picked.length >= 6) break;
      if (field.args.length) continue; // fields that need arguments are not safe to select blindly
      const inner = model.types.get(this.unwrap(field.type));
      if (inner && (inner.kind === 'object' || inner.kind === 'interface' || inner.kind === 'union')) {
        if (depth >= 1) continue;
        const nested = this.selectionFor(field.type, model, depth + 1);
        if (nested) picked.push(`${field.name}${nested}`);
      } else {
        picked.push(field.name);
      }
    }
    return picked.length ? ` { ${picked.join(' ')} }` : '';
  }

  /** JSON schema for a GraphQL wire type (`[Post!]!`, `CreatePostInput`, `Status`). */
  private static schemaFor(graphqlType: string, model: SdlModel, depth: number): any {
    let type = graphqlType.trim();
    const required = type.endsWith('!');
    type = type.replace(/!$/, '');
    if (type.startsWith('[')) {
      const inner = type.slice(1, type.lastIndexOf(']'));
      return { type: 'array', items: this.schemaFor(inner, model, depth + 1), ...(required ? {} : { nullable: true }) };
    }
    const nullable = required ? {} : { nullable: true };
    const def = model.types.get(type);
    if (!def) return { ...(SCALAR_SCHEMAS[type] || { type: 'string' }), ...nullable };
    switch (def.kind) {
      case 'scalar': return { ...(SCALAR_SCHEMAS[type] || { type: 'string' }), ...nullable, ...(def.description ? { description: def.description } : {}) };
      case 'enum': return { type: 'string', enum: def.enumValues, ...nullable };
      case 'union': return { oneOf: def.unionMembers.map((m) => this.schemaFor(m, model, depth + 1)), ...nullable };
      default: {
        if (depth > 3) return { type: 'object', ...nullable };
        const properties: Record<string, any> = {};
        const requiredFields: string[] = [];
        for (const field of def.fields) {
          properties[field.name] = this.schemaFor(field.type, model, depth + 1);
          if (field.description) properties[field.name].description = field.description;
          if (field.type.endsWith('!')) requiredFields.push(field.name);
        }
        return { type: 'object', properties, ...(requiredFields.length ? { required: requiredFields } : {}), ...nullable, ...(def.description ? { description: def.description } : {}) };
      }
    }
  }

  private static unwrap(graphqlType: string): string {
    return graphqlType.replace(/[[\]!\s]/g, '');
  }
}
