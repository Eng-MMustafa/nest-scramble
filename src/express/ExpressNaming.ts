/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import * as path from 'path';

/** Filename segments that carry no meaning for a docs group label. */
const NOISE_SEGMENTS = new Set([
  'routes', 'route', 'router', 'routers', 'controller', 'controllers',
  'handler', 'handlers', 'api', 'index', 'main', 'server', 'src',
]);

/** Segments whose most common REST verb is inferred from the HTTP method. */
const VERB_BY_METHOD: Record<string, string> = {
  post: 'Create',
  put: 'Update',
  patch: 'Update',
  delete: 'Delete',
};

export function pascalCase(input: string): string {
  return input
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
}

/**
 * Turns a route file path into a docs group label the way NestJS controller
 * names read: `routes/orders.js` → `Orders`, `users.routes.ts` → `Users`,
 * `websocket/orders.gateway.js` → `OrdersGateway`, `app.js` → `App`.
 */
export function friendlyName(filePath: string): string {
  const base = path.basename(filePath, path.extname(filePath));
  const dir = path.basename(path.dirname(filePath));

  const segments = base.split(/[.\-_]+/).filter((s) => s && !NOISE_SEGMENTS.has(s.toLowerCase()));
  if (segments.length === 0) {
    const fallback = dir && !NOISE_SEGMENTS.has(dir.toLowerCase()) ? dir : base;
    return pascalCase(fallback) || 'App';
  }
  return pascalCase(segments.join(' '));
}

/**
 * Assigns friendly names to a list of files, disambiguating collisions with
 * the parent directory (`admin/users.js` + `public/users.js` →
 * `AdminUsers` / `PublicUsers`).
 */
export function friendlyNames(filePaths: string[]): Map<string, string> {
  const raw = new Map<string, string>();
  const counts = new Map<string, number>();
  for (const file of filePaths) {
    const name = friendlyName(file);
    raw.set(file, name);
    counts.set(name, (counts.get(name) || 0) + 1);
  }

  const result = new Map<string, string>();
  for (const file of filePaths) {
    const name = raw.get(file)!;
    if ((counts.get(name) || 0) > 1) {
      const dir = path.basename(path.dirname(file));
      result.set(file, pascalCase(dir) + name);
    } else {
      result.set(file, name);
    }
  }
  return result;
}

function singular(word: string): string {
  if (/ies$/i.test(word)) return word.replace(/ies$/i, 'y');
  if (/(ses|xes|zes|ches|shes)$/i.test(word)) return word.replace(/es$/i, '');
  if (/s$/i.test(word) && !/ss$/i.test(word)) return word.slice(0, -1);
  return word;
}

/**
 * Names a request body schema after the route the way a DTO would be named:
 * `POST /api/users` → `CreateUserBody`, `PUT /api/users/{id}` →
 * `UpdateUserBody`, `POST /api/auth/login` → `LoginBody`.
 */
export function bodySchemaName(method: string, routePath: string): string {
  const segments = routePath
    .split('/')
    .filter((s) => s && !/^[{:]/.test(s) && !/^v\d+$/i.test(s) && s.toLowerCase() !== 'api');
  const last = segments[segments.length - 1] || 'Request';
  const isCollection = /s$/i.test(last) && !/ss$/i.test(last);
  const verb = VERB_BY_METHOD[method.toLowerCase()] || '';
  const noun = pascalCase(isCollection ? singular(last) : last);
  return isCollection ? `${verb}${noun}Body` : `${noun}Body`;
}
