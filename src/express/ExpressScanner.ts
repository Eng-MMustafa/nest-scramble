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
    const controllers: ExpressControllerInfo[] = [];

    for (const file of files) {
      const text = fs.readFileSync(file, 'utf-8');
      const routes = this.extractRoutes(text);
      if (routes.length === 0) continue;

      const relative = path.relative(absolutePath, file);
      const baseName = path.basename(file, path.extname(file));
      const dirName = path.dirname(relative).replace(/[\\/]/g, '/');
      const tag = dirName === '.' ? baseName : `${dirName}/${baseName}`;

      controllers.push({
        name: tag,
        filePath: file,
        basePath: '',
        routes,
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

    // 2. app.use('/api/users', ...) — mounted routers/routers.
    const usePattern = /(?:app|server)\.use\s*\(\s*['"\`]([^'"\`]+)['"\`]/g;
    while ((match = usePattern.exec(text)) !== null) {
      routes.push(this.buildRoute('use', match[1], 'Mounted middleware/router'));
    }

    // 3. app.route('/users').get(...)
    const routeBuilderPattern = /(?:app|router|server)\.route\s*\(\s*['"\`]([^'"\`]+)['"\`]\s*\)/g;
    while ((match = routeBuilderPattern.exec(text)) !== null) {
      routes.push(this.buildRoute('all', match[1], 'Route builder'));
    }

    return routes;
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
}
