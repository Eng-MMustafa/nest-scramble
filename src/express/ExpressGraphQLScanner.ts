/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import * as fs from 'fs';
import * as path from 'path';

export interface ExpressGraphQLOperation {
  name: string;
  kind: 'query' | 'mutation';
  summary: string;
  sample: string;
  args?: any[];
  response?: any;
  description?: string;
}

export interface ExpressGraphQLResolver {
  name: string;
  filePath: string;
  operations: ExpressGraphQLOperation[];
}

const IGNORED_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', 'test', 'tests', '__tests__']);

/**
 * Heuristic scanner for GraphQL schemas in Express/Node.js projects.
 *
 * It looks for `buildSchema(...)` calls or `.graphql` files and extracts
 * Query/Mutation field names from the SDL to produce runnable sample
 * operations for the docs UI.
 */
export class ExpressGraphQLScanner {
  static scan(sourcePath: string): ExpressGraphQLResolver[] {
    const absolutePath = path.resolve(sourcePath);
    if (!fs.existsSync(absolutePath)) return [];

    const files = this.collectFiles(absolutePath);
    const resolvers: ExpressGraphQLResolver[] = [];

    for (const file of files) {
      const text = fs.readFileSync(file, 'utf-8');
      const sdl = this.extractSdl(text, file);
      if (!sdl) continue;

      const operations = this.parseOperations(sdl);
      if (operations.length === 0) continue;

      const relative = path.relative(absolutePath, file).replace(/[\\/]/g, '/');
      const baseName = path.basename(file, path.extname(file));
      const dirName = path.dirname(relative);
      const tag = dirName === '.' ? baseName : `${dirName}/${baseName}`;

      resolvers.push({ name: tag, filePath: file, operations });
    }

    return resolvers;
  }

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
        if (!IGNORED_DIRS.has(entry.name)) {
          this.collectFiles(full, out, depth + 1);
        }
      } else if (entry.isFile() && /\.(js|ts|mjs|cjs|graphql|gql)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
        out.push(full);
      }
    }

    return out;
  }

  private static extractSdl(text: string, filePath: string): string {
    if (filePath.endsWith('.graphql') || filePath.endsWith('.gql')) {
      return text;
    }

    const buildSchemaMatch = /buildSchema\s*\(\s*[`'"]([^`'"]+)[`'"]/s.exec(text);
    if (buildSchemaMatch) {
      return buildSchemaMatch[1];
    }

    return '';
  }

  private static parseOperations(sdl: string): ExpressGraphQLOperation[] {
    const operations: ExpressGraphQLOperation[] = [];
    const typeFields = this.extractTypeFields(sdl);

    const typePattern = /type\s+(Query|Mutation)\s*\{([^}]*)\}/g;
    let match: RegExpExecArray | null;
    while ((match = typePattern.exec(sdl)) !== null) {
      const kind = match[1].toLowerCase() as 'query' | 'mutation';
      const body = match[2];

      // Extract field definitions: fieldName(args): ReturnType
      const fieldPattern = /(\w+)\s*(?:\([^)]*\))?\s*:\s*([\w\[\]!]+)/g;
      let fieldMatch: RegExpExecArray | null;
      while ((fieldMatch = fieldPattern.exec(body)) !== null) {
        const name = fieldMatch[1];
        const returnType = fieldMatch[2].trim();
        const baseType = this.unwrapGraphQLType(returnType);
        const subfields = typeFields[baseType] || [];
        const selection = subfields.length
          ? ` { ${subfields.slice(0, 5).join(' ')} }`
          : '';

        operations.push({
          name,
          kind,
          summary: `${kind === 'query' ? 'Query' : 'Mutation'} ${name}`,
          sample: `${kind} { ${name}${selection} }`,
          response: { type: this.graphqlTypeToJsonType(returnType), properties: Object.fromEntries(subfields.map((f) => [f, {}])) },
        });
      }
    }

    return operations;
  }

  private static extractTypeFields(sdl: string): Record<string, string[]> {
    const fields: Record<string, string[]> = {};
    const typePattern = /type\s+(\w+)\s*\{([^}]*)\}/g;
    let match: RegExpExecArray | null;

    while ((match = typePattern.exec(sdl)) !== null) {
      const typeName = match[1];
      const body = match[2];
      const fieldPattern = /(\w+)\s*(?:\([^)]*\))?\s*:\s*([\w\[\]!]+)/g;
      let fieldMatch: RegExpExecArray | null;
      const typeFields: string[] = [];
      while ((fieldMatch = fieldPattern.exec(body)) !== null) {
        typeFields.push(fieldMatch[1]);
      }
      if (typeFields.length) {
        fields[typeName] = typeFields;
      }
    }

    return fields;
  }

  private static unwrapGraphQLType(graphqlType: string): string {
    return graphqlType.replace(/^[\[!]+/, '').replace(/[\]!]+$/, '');
  }

  private static graphqlTypeToJsonType(graphqlType: string): string {
    if (/String|ID/.test(graphqlType)) return 'string';
    if (/Int|Float/.test(graphqlType)) return 'number';
    if (/Boolean/.test(graphqlType)) return 'boolean';
    if (/\[/.test(graphqlType)) return 'array';
    return 'object';
  }
}
