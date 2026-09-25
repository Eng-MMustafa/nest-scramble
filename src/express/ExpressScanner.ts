/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import * as fs from 'fs';
import * as path from 'path';

export interface ExpressRouteInfo {
  method: string;
  path: string;
  summary?: string;
  description?: string;
  handlerName?: string;
  tags?: string[];
  parameters?: any[];
  responses?: Record<string, any>;
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
 * mounts, and route() builders).
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
    const parsed = files.map((file) => this.parseFile(file));

    // Resolve `app.use('/prefix', require('./router'))` mounts.
    const mounts = this.resolveMounts(parsed, absolutePath);

    const controllers: ExpressControllerInfo[] = [];
    const mountedTargets = new Set(mounts.map((m) => m.targetFile));

    for (const item of parsed) {
      if (item.routes.length === 0) continue;

      // Router files that are mounted elsewhere have their routes prefixed
      // by the mount declaration and emitted under the mount point instead
      // of as a standalone controller.
      if (item.isRouter && mountedTargets.has(item.filePath)) {
        const itemMounts = mounts.filter((m) => m.targetFile === item.filePath);
        for (const mount of itemMounts) {
          controllers.push({
            name: this.fileTag(item.filePath, absolutePath),
            filePath: item.filePath,
            basePath: mount.prefix,
            routes: item.routes.map((r) => this.prefixRoute(r, mount.prefix)),
          });
        }
        continue;
      }

      const relative = path.relative(absolutePath, item.filePath);
      const baseName = path.basename(item.filePath, path.extname(item.filePath));
      const dirName = path.dirname(relative).replace(/[\\/]/g, '/');
      const tag = dirName === '.' ? baseName : `${dirName}/${baseName}`;

      controllers.push({
        name: tag,
        filePath: item.filePath,
        basePath: '',
        routes: item.routes,
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

  private static parseFile(filePath: string): ParsedFile {
    const text = fs.readFileSync(filePath, 'utf-8');
    const routes = this.extractRoutes(text);
    const mounts = this.extractMounts(text, filePath);
    const isRouter = /(?:module\s*\.\s*exports\s*=|export\s+default)\s*router\b/.test(text);

    return { filePath, isRouter, routes, mounts };
  }

  private static extractRoutes(text: string): ExpressRouteInfo[] {
    const routes: ExpressRouteInfo[] = [];

    // 1. Direct method calls: app.get('/users', ...), router.post('/users', ...)
    const methodPattern = new RegExp(
      `(?:app|router|route|server)\\.(${ROUTE_METHODS.join('|')})\\s*\\(\\s*['"\`]([^'"\`]+)['"\`]`,
      'g',
    );
    let match: RegExpExecArray | null;
    while ((match = methodPattern.exec(text)) !== null) {
      routes.push(this.buildRoute(match[1], match[2]));
    }

    // 2. app.route('/users').get(...)
    const routeBuilderPattern = /(?:app|router|server)\.route\s*\(\s*['"\`]([^'"\`]+)['"\`]\s*\)/g;
    while ((match = routeBuilderPattern.exec(text)) !== null) {
      routes.push(this.buildRoute('all', match[1], 'Route builder'));
    }

    return routes;
  }

  private static extractMounts(text: string, filePath: string): MountInfo[] {
    const mounts: MountInfo[] = [];
    const variableRequires = this.extractVariableRequires(text, filePath);

    // 1. Inline require: app.use('/api', require('./routes/api'))
    const inlinePattern = /(?:app|server)\.use\s*\(\s*['"\`]([^'"\`]+)['"\`]\s*,\s*require\s*\(\s*['"\`]([^'"\`]+)['"\`]\s*\)\s*\)/g;
    let match: RegExpExecArray | null;
    while ((match = inlinePattern.exec(text)) !== null) {
      const importPath = match[2];
      const resolved = this.resolveImportPath(importPath, filePath);
      if (resolved) {
        mounts.push({ prefix: match[1], targetFile: resolved });
      }
    }

    // 2. Variable reference: const api = require('./routes/api'); app.use('/api', api)
    const variablePattern = /(?:app|server)\.use\s*\(\s*['"\`]([^'"\`]+)['"\`]\s*,\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\)/g;
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
      /(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*require\s*\(\s*['"\`]([^'"\`]+)['"\`]\s*\)/g,
      /(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*import\s*\(\s*['"\`]([^'"\`]+)['"\`]\s*\)/g,
      /import\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s+from\s+['"\`]([^'"\`]+)['"\`]/g,
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

  private static resolveMounts(parsed: ParsedFile[], sourcePath: string): MountInfo[] {
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
    return {
      ...route,
      path: normalizedPrefix + normalizedPath,
      summary: `${route.summary} (${normalizedPrefix})`,
    };
  }

  private static buildRoute(method: string, rawPath: string, summary?: string): ExpressRouteInfo {
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

    return {
      method,
      path: pathWithBraces,
      summary: summary || `${method.toUpperCase()} ${cleanPath}`,
      handlerName: undefined,
      parameters,
      responses: {
        '200': { description: 'OK' },
      },
    };
  }

  private static fileTag(filePath: string, sourcePath: string): string {
    const relative = path.relative(sourcePath, filePath);
    const baseName = path.basename(filePath, path.extname(filePath));
    const dirName = path.dirname(relative).replace(/[\\/]/g, '/');
    return dirName === '.' ? baseName : `${dirName}/${baseName}`;
  }
}
