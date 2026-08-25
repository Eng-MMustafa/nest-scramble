import { buildWildcardRoute, getNestMajorVersion } from '../src/utils/NestCompat';
import { normalizeDocsPath } from '../src/controllers/DocsController';

describe('getNestMajorVersion', () => {
  it('resolves the installed @nestjs/core major version', () => {
    const major = getNestMajorVersion();
    expect(major).not.toBeNull();
    expect(Number.isInteger(major)).toBe(true);
    expect(major).toBeGreaterThanOrEqual(10);
  });
});

describe('buildWildcardRoute', () => {
  const nestMajor = getNestMajorVersion();

  it('produces a pattern valid for the installed Express version', () => {
    const route = buildWildcardRoute('scramble-mock');

    if (nestMajor !== null && nestMajor <= 10) {
      // Express 4 / path-to-regexp v6 only understands the anonymous wildcard.
      expect(route).toBe('scramble-mock/*');
    } else {
      // Express 5 / path-to-regexp v8 rejects anonymous wildcards outright.
      expect(route).toBe('scramble-mock/*splat');
    }
  });

  it('never emits an anonymous wildcard on NestJS 11+', () => {
    if (nestMajor !== null && nestMajor >= 11) {
      expect(buildWildcardRoute('scramble-mock')).not.toBe('scramble-mock/*');
    }
  });

  it('strips surrounding slashes from the prefix', () => {
    expect(buildWildcardRoute('/scramble-mock/')).toMatch(/^scramble-mock\/\*/);
  });

  it('handles an empty prefix', () => {
    expect(buildWildcardRoute('')).toMatch(/^\*/);
    expect(buildWildcardRoute('')).not.toContain('/');
  });
});

describe('normalizeDocsPath', () => {
  it('defaults to docs', () => {
    expect(normalizeDocsPath(undefined)).toBe('docs');
    expect(normalizeDocsPath('')).toBe('docs');
    expect(normalizeDocsPath('/')).toBe('docs');
  });

  it('strips leading and trailing slashes', () => {
    expect(normalizeDocsPath('/docs')).toBe('docs');
    expect(normalizeDocsPath('docs/')).toBe('docs');
    expect(normalizeDocsPath('/api/reference/')).toBe('api/reference');
  });

  it('preserves nested paths', () => {
    expect(normalizeDocsPath('api/v1/reference')).toBe('api/v1/reference');
  });
});
