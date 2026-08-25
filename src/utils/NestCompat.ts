/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/

/**
 * Compatibility helpers for the differences between NestJS 10 (Express 4)
 * and NestJS 11 (Express 5 / path-to-regexp v8).
 */

/**
 * Resolves the installed `@nestjs/core` major version.
 *
 * Returns `null` when the version cannot be determined, so callers can fall
 * back to the most permissive behaviour instead of guessing wrong.
 */
export function getNestMajorVersion(): number | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { version } = require('@nestjs/core/package.json');
    const major = parseInt(String(version).split('.')[0], 10);
    return Number.isNaN(major) ? null : major;
  } catch {
    return null;
  }
}

/**
 * Builds a "match everything below this prefix" route pattern that is valid for
 * the installed NestJS/Express combination.
 *
 * Express 5 (NestJS 11+) uses path-to-regexp v8, where an anonymous `*`
 * wildcard throws `TypeError: Missing parameter name`. Named wildcards
 * (`*splat`) are required instead. Express 4 (NestJS 10) only understands the
 * anonymous form.
 *
 * @param prefix Route prefix without leading/trailing slashes, e.g. `scramble-mock`
 */
export function buildWildcardRoute(prefix: string): string {
  const normalized = prefix.replace(/^\/+|\/+$/g, '');
  const major = getNestMajorVersion();

  // Unknown version: assume modern Express 5 semantics, which is what any
  // currently supported NestJS release ships with.
  const usesNamedWildcard = major === null || major >= 11;

  const wildcard = usesNamedWildcard ? '*splat' : '*';

  return normalized ? `${normalized}/${wildcard}` : wildcard;
}
