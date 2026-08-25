/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/

/**
 * Single source of truth for turning scanned controller metadata into a route.
 *
 * The OpenAPI transformer and the mock middleware each used to build paths with
 * their own private copy of this logic, so they drifted: the transformer learned
 * about `globalPrefix` and `@Version` while the middleware did not, which meant
 * the documented path and the path the mock answered on were different.
 */
export interface RouteDescriptor {
  /** Value passed to `app.setGlobalPrefix()`, if any. */
  globalPrefix?: string;
  /** `@Version()` on the method, falling back to the controller. */
  version?: string | string[];
  /** Path from `@Controller()`. */
  controllerPath?: string;
  /** Path from the HTTP method decorator. */
  methodRoute?: string;
}

/** True when a segment is a Nest (`:id`) or OpenAPI (`{id}`) path parameter. */
export function isParamSegment(segment: string): boolean {
  return segment.startsWith(':') || (segment.startsWith('{') && segment.endsWith('}'));
}

/** Extracts the parameter name from a `:id` or `{id}` segment. */
export function paramName(segment: string): string {
  if (segment.startsWith(':')) return segment.slice(1);
  if (segment.startsWith('{') && segment.endsWith('}')) return segment.slice(1, -1);
  return segment;
}

/**
 * Builds the ordered, non-empty path segments for a route, preserving whatever
 * parameter syntax the source used.
 */
export function buildRouteSegments(descriptor: RouteDescriptor): string[] {
  const parts: string[] = [];

  if (descriptor.globalPrefix) parts.push(descriptor.globalPrefix);

  if (descriptor.version) {
    const version = Array.isArray(descriptor.version) ? descriptor.version[0] : descriptor.version;
    if (version) parts.push(`v${version}`);
  }

  if (descriptor.controllerPath) parts.push(descriptor.controllerPath);
  if (descriptor.methodRoute) parts.push(descriptor.methodRoute);

  // A single part may itself be a nested route such as `legacy/:id`.
  return parts
    .join('/')
    .split('/')
    .filter(segment => segment.length > 0);
}

/** Renders segments as an OpenAPI path, converting `:id` to `{id}`. */
export function toOpenApiPath(segments: string[]): string {
  const normalized = segments.map(segment =>
    segment.startsWith(':') ? `{${segment.slice(1)}}` : segment,
  );
  return '/' + normalized.join('/');
}

/** Splits a request path into comparable segments. */
export function requestSegments(path: string): string[] {
  return path.split('/').filter(segment => segment.length > 0);
}

/**
 * Compares two candidate routes of equal length by specificity.
 *
 * Returns a negative number when `a` is more specific than `b`. A static segment
 * always beats a parameter at the earliest position where they differ, which is
 * how production routers rank overlapping routes.
 */
export function compareSpecificity(a: string[], b: string[]): number {
  const length = Math.min(a.length, b.length);

  for (let i = 0; i < length; i++) {
    const aIsParam = isParamSegment(a[i]);
    const bIsParam = isParamSegment(b[i]);
    if (aIsParam !== bIsParam) {
      return aIsParam ? 1 : -1;
    }
  }

  return 0;
}
