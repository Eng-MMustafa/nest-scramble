/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import * as fs from 'fs';
import * as path from 'path';
import { friendlyNames } from './ExpressNaming';
import { ExpressBodyInference, InferredBody } from './ExpressBodyInference';
import { ExpressResponseInference, ResponseContext } from './ExpressResponseInference';
import { ExpressSymbolRegistry } from './ExpressSymbolRegistry';
import { matchBracket } from './ExpressLexical';

export interface ExpressRouteInfo {
  method: string;
  path: string;
  summary?: string;
  description?: string;
  handlerName?: string;
  tags?: string[];
  parameters?: any[];
  responses?: Record<string, any>;
  security?: any[];
  hasFileUpload?: boolean;
  consumes?: string[];
  bodySchema?: { properties: Record<string, any>; required: string[]; source?: InferredBody['source']; name?: string };
}

export interface ExpressControllerInfo {
  name: string;
  filePath: string;
  basePath: string;
  routes: ExpressRouteInfo[];
}

const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.git',
  'test',
  'tests',
  '__tests__',
]);

const ROUTE_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'all'];

interface MountInfo {
  prefix: string;
  targetFile: string;
}

interface ParsedFile {
  filePath: string;
  isRouter: boolean;
  routes: ExpressRouteInfo[];
  mounts: MountInfo[];
}

/**
 * Heuristic static scanner for Express/Node.js applications.
 *
 * It reads `.js` and `.ts` source files and looks for the most common route
 * declaration patterns. Because Express routing is dynamic, this cannot be
 * 100% exhaustive without executing the app, but it covers the conventions
 * used by the vast majority of projects (app/router method chains, app.use
 * mounts, route() builders and JSDoc summaries).
 */
export class ExpressScanner {
  /**
   * Scan a directory for Express routes and group them by source file.
   */
  static scan(sourcePath: string): ExpressControllerInfo[] {
    const absolutePath = path.resolve(sourcePath);
    if (!fs.existsSync(absolutePath)) {
      return [];
    }

    const files = this.collectFiles(absolutePath);
    const registry = new ExpressSymbolRegistry();
    const bodies = new ExpressBodyInference(registry);
    const parsed = files.map((file) => this.parseFile(file, bodies, registry));

    // Resolve `app.use('/prefix', require('./router'))` mounts.
    const mounts = this.resolveMounts(parsed, absolutePath);

    const controllers: ExpressControllerInfo[] = [];
    const mountedTargets = new Set(mounts.map((m) => m.targetFile));
    const withRoutes = parsed.filter((item) => item.routes.length > 0);
    // Group labels read like NestJS controller names (`Orders`, `Users`)
    // instead of file paths, disambiguated by directory on collision.
    const names = friendlyNames(withRoutes.map((item) => item.filePath));

    for (const item of withRoutes) {
      const tag = names.get(item.filePath) || this.fileTag(item.filePath, absolutePath);

      // Router files that are mounted elsewhere have their routes prefixed
      // by the mount declaration and emitted under the mount point instead
      // of as a standalone controller.
      if (item.isRouter && mountedTargets.has(item.filePath)) {
        const itemMounts = mounts.filter((m) => m.targetFile === item.filePath);
        for (const mount of itemMounts) {
          controllers.push({
            name: tag,
            filePath: item.filePath,
            basePath: mount.prefix,
            routes: item.routes.map((r) => ({ ...this.prefixRoute(r, mount.prefix), tags: r.tags || [tag] })),
          });
        }
        continue;
      }

      controllers.push({
        name: tag,
        filePath: item.filePath,
        basePath: '',
        routes: item.routes.map((r) => ({ ...r, tags: r.tags || [tag] })),
      });
    }

    return controllers;
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
      } else if (entry.isFile() && /\.(js|ts|mjs|cjs)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
        out.push(full);
      }
    }

    return out;
  }

  private static parseFile(filePath: string, bodies: ExpressBodyInference, registry: ExpressSymbolRegistry): ParsedFile {
    const text = fs.readFileSync(filePath, 'utf-8');
    const routes = this.extractRoutes(text, filePath, bodies, registry);
    const mounts = this.extractMounts(text, filePath);
    const isRouter = /(?:module\s*\.\s*exports\s*=|export\s+default)\s*router\b/.test(text);

    return { filePath, isRouter, routes, mounts };
  }

  private static extractRoutes(text: string, filePath: string, bodies: ExpressBodyInference, registry: ExpressSymbolRegistry): ExpressRouteInfo[] {
    const routes: ExpressRouteInfo[] = [];

    // Capture route-builder declarations so we can associate chained calls.
    const routeBuilderPattern = /(?:app|router|server)\.route\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
    const routeBuilders: { index: number; path: string }[] = [];
    let match: RegExpExecArray | null;
    while ((match = routeBuilderPattern.exec(text)) !== null) {
      routeBuilders.push({ index: match.index, path: match[1] });
    }

    // Direct method calls: app.get('/users', ...), router.post('/users', requireAuth, ...)
    // Capture the full argument list so we can spot middleware and upload handlers.
    const methodPattern = new RegExp(
      `(?:app|router|route|server)\\.(${ROUTE_METHODS.join('|')})\\s*\\(\\s*['"\`]([^'"\`]+)['"\`]\\s*(?:,\\s*([^)]*))?\\s*\\)`,
      'g',
    );

    while ((match = methodPattern.exec(text)) !== null) {
      const method = match[1];
      const rawPath = match[2];
      const middlewareArgs = match[3] || '';
      const start = match.index;

      // Find the closest preceding route builder if this call is chained.
      let builderPath: string | undefined;
      for (let i = routeBuilders.length - 1; i >= 0; i--) {
        if (routeBuilders[i].index < start) {
          builderPath = routeBuilders[i].path;
          break;
        }
      }

      const { summary, description } = this.extractPrecedingJsDoc(text, start);
      const body = this.extractHandlerBody(text, start);
      const head = this.extractRouteHead(text, start);
      const combined = `${middlewareArgs} ${head} ${body}`;

      routes.push(
        this.buildRoute(
          builderPath ? 'all' : method,
          builderPath || rawPath,
          summary,
          description,
          combined,
          bodies.infer(head, body, filePath),
          { filePath, registry },
        ),
      );
    }

    return routes;
  }

  /**
   * The route call from its opening `(` up to (not including) the handler
   * body: middleware references, validator chains and the handler signature
   * (`(req: Request<{}, {}, CreateUserDto>, res)`).
   */
  private static extractRouteHead(text: string, routeIndex: number): string {
    const open = text.indexOf('(', routeIndex);
    if (open === -1) return '';
    const close = matchBracket(text, open);
    const call = close === -1 ? text.slice(open, open + 4000) : text.slice(open, close);
    const bodyStart = call.search(/=>\s*\{|function\s*\([^)]*\)\s*\{|\)\s*\{/);
    return bodyStart === -1 ? call : call.slice(0, bodyStart + 2);
  }

  private static extractMounts(text: string, filePath: string): MountInfo[] {
    const mounts: MountInfo[] = [];
    const variableRequires = this.extractVariableRequires(text, filePath);

    // 1. Inline require: app.use('/api', require('./routes/api'))
    const inlinePattern = /(?:app|server)\.use\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)\s*\)/g;
    let match: RegExpExecArray | null;
    while ((match = inlinePattern.exec(text)) !== null) {
      const importPath = match[2];
      const resolved = this.resolveImportPath(importPath, filePath);
      if (resolved) {
        mounts.push({ prefix: match[1], targetFile: resolved });
      }
    }

    // 2. Variable reference: const api = require('./routes/api'); app.use('/api', api)
    const variablePattern = /(?:app|server)\.use\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\)/g;
    while ((match = variablePattern.exec(text)) !== null) {
      const variableName = match[2];
      const resolved = variableRequires.get(variableName);
      if (resolved) {
        mounts.push({ prefix: match[1], targetFile: resolved });
      }
    }

    return mounts;
  }

  private static extractVariableRequires(text: string, filePath: string): Map<string, string> {
    const map = new Map<string, string>();
    const patterns = [
      /(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
      /(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
      /import\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s+from\s+['"`]([^'"`]+)['"`]/g,
    ];

    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const resolved = this.resolveImportPath(match[2], filePath);
        if (resolved) {
          map.set(match[1], resolved);
        }
      }
    }

    return map;
  }

  private static resolveMounts(parsed: ParsedFile[], _sourcePath: string): MountInfo[] {
    const fileSet = new Set(parsed.map((p) => p.filePath));
    const mounts: MountInfo[] = [];

    for (const item of parsed) {
      for (const mount of item.mounts) {
        if (fileSet.has(mount.targetFile)) {
          mounts.push(mount);
        }
      }
    }

    return mounts;
  }

  private static resolveImportPath(importPath: string, fromFile: string): string {
    if (importPath.startsWith('.')) {
      const dir = path.dirname(fromFile);
      const resolved = path.resolve(dir, importPath);
      const candidates = [resolved, `${resolved}.js`, `${resolved}.ts`, `${resolved}.mjs`, `${resolved}.cjs`];
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) return candidate;
      }
    }
    return '';
  }

  private static prefixRoute(route: ExpressRouteInfo, prefix: string): ExpressRouteInfo {
    const normalizedPrefix = prefix.replace(/\/$/, '');
    const normalizedPath = route.path === '/' ? '' : route.path.startsWith('/') ? route.path : `/${route.path}`;
    const fullPath = normalizedPrefix + normalizedPath;
    return {
      ...route,
      path: fullPath,
      summary: `${route.method.toUpperCase()} ${fullPath}`,
    };
  }

  private static buildRoute(
    method: string,
    rawPath: string,
    summary?: string,
    description?: string,
    body?: string,
    inferredBody?: InferredBody,
    context?: ResponseContext,
  ): ExpressRouteInfo {
    const cleanPath = rawPath.replace(/\?:/g, ':').replace(/\?/g, '');
    const parameters: any[] = [];
    const pathWithBraces = cleanPath.replace(/:([^/]+)/g, (_, name) => {
      parameters.push({
        name,
        in: 'path',
        required: true,
        schema: { type: 'string' },
      });
      return `{${name}}`;
    });

    const responses: Record<string, any> = {};
    for (const [code, info] of Object.entries(ExpressResponseInference.infer(body || '', method, context))) {
      const entry: any = { description: info.description };
      if (info.schema) {
        entry.content = { 'application/json': { schema: info.schema, ...(info.example !== undefined ? { example: info.example } : {}) } };
      }
      responses[code] = entry;
    }
    // Guarded routes answer 401 even when the handler never spells it out.
    const security = body && /requireAuth|isAuthenticated|authMiddleware|ensureAuth|authenticate\b|passport\.authenticate|verifyToken|checkAuth|jwtAuth|authGuard/i.test(body)
      ? [{ bearerAuth: [] }]
      : undefined;
    if (security && !responses['401']) responses['401'] = { description: 'Unauthorized' };

    const hasFileUpload = body ? /upload\.(single|array|fields|any)\s*\(|multer\s*\(/.test(body) : false;
    const bodySchema = inferredBody
      ? { properties: inferredBody.properties, required: inferredBody.required, source: inferredBody.source, name: inferredBody.name }
      : undefined;
    const readsBody = body ? /req\.body|\bbody\s*\(/.test(body) || !!inferredBody : false;
    const consumes = hasFileUpload
      ? ['multipart/form-data']
      : readsBody && !/^(get|head|delete|options)$/.test(method)
        ? ['application/json']
        : undefined;

    return {
      method,
      path: pathWithBraces,
      summary: summary || `${method.toUpperCase()} ${cleanPath}`,
      description,
      handlerName: undefined,
      parameters,
      responses,
      security,
      hasFileUpload,
      consumes,
      bodySchema,
    };
  }

  private static extractPrecedingJsDoc(text: string, routeIndex: number): { summary?: string; description?: string } {
    const preceding = text.slice(0, routeIndex);
    const match = /\/\*\*([\s\S]*?)\*\/$/.exec(preceding);
    if (!match) return {};

    const lines = match[1]
      .split('\n')
      .map((line) => line.replace(/^\s*\*\s?/, '').trim())
      .filter((line) => line.length > 0 && !line.startsWith('@'));

    if (lines.length === 0) return {};
    return { summary: lines[0], description: lines.slice(1).join('\n') || undefined };
  }

  private static extractHandlerBody(text: string, routeIndex: number): string {
    const after = text.slice(routeIndex);
    // Find the opening brace of the arrow function / function body.
    const bodyStart = after.search(/=>\s*\{|function\s*\([^)]*\)\s*\{/);
    if (bodyStart === -1) return '';

    let depth = 0;
    let inString: string | null = null;
    let escaped = false;
    const body = after.slice(bodyStart);

    for (let i = 0; i < body.length; i++) {
      const char = body[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\' && inString) {
        escaped = true;
        continue;
      }
      if (inString) {
        if (char === inString) inString = null;
        continue;
      }
      if (char === '"' || char === "'" || char === '`') {
        inString = char;
        continue;
      }
      if (char === '{') depth++;
      if (char === '}') {
        depth--;
        if (depth === 0) return body.slice(0, i + 1);
      }
    }

    return body;
  }

  private static fileTag(filePath: string, sourcePath: string): string {
    const relative = path.relative(sourcePath, filePath);
    const baseName = path.basename(filePath, path.extname(filePath));
    const dirName = path.dirname(relative).replace(/[\\/]/g, '/');
    return dirName === '.' ? baseName : `${dirName}/${baseName}`;
  }
}
