/**
 * Tests for the shared route builder.
 *
 * This module exists because the OpenAPI transformer and the mock middleware
 * each carried their own copy of the path logic and drifted apart: the
 * transformer learned about `globalPrefix` and `@Version` while the middleware
 * did not, so the documented path and the path the mock answered on differed.
 */
import {
  buildRouteSegments,
  compareSpecificity,
  isParamSegment,
  paramName,
  requestSegments,
  toOpenApiPath,
} from '../src/utils/RoutePath';

describe('isParamSegment', () => {
  it.each([':id', ':userId', '{id}'])('treats %s as a parameter', (segment) => {
    expect(isParamSegment(segment)).toBe(true);
  });

  it.each(['users', 'me', '', 'v1'])('treats %s as static', (segment) => {
    expect(isParamSegment(segment)).toBe(false);
  });
});

describe('paramName', () => {
  it('strips the Nest colon prefix', () => {
    expect(paramName(':userId')).toBe('userId');
  });

  it('strips the OpenAPI braces', () => {
    expect(paramName('{userId}')).toBe('userId');
  });

  it('returns a static segment unchanged', () => {
    expect(paramName('users')).toBe('users');
  });
});

describe('buildRouteSegments', () => {
  it('joins the controller path and method route', () => {
    expect(buildRouteSegments({ controllerPath: 'users', methodRoute: ':id' })).toEqual(['users', ':id']);
  });

  it('returns no segments for a root route', () => {
    expect(buildRouteSegments({ controllerPath: '', methodRoute: '' })).toEqual([]);
  });

  it('prepends the global prefix', () => {
    expect(buildRouteSegments({ globalPrefix: 'api', controllerPath: 'users', methodRoute: '' })).toEqual([
      'api',
      'users',
    ]);
  });

  it('inserts the version between the prefix and the controller', () => {
    expect(
      buildRouteSegments({ globalPrefix: 'api', version: '2', controllerPath: 'users', methodRoute: '' }),
    ).toEqual(['api', 'v2', 'users']);
  });

  it('uses the first entry of an array version', () => {
    expect(buildRouteSegments({ version: ['3', '4'], controllerPath: 'users' })).toEqual(['v3', 'users']);
  });

  it('splits a nested method route into separate segments', () => {
    expect(buildRouteSegments({ controllerPath: 'accounts', methodRoute: 'legacy/:id' })).toEqual([
      'accounts',
      'legacy',
      ':id',
    ]);
  });

  it('collapses redundant slashes', () => {
    expect(buildRouteSegments({ controllerPath: '/users/', methodRoute: '/:id/' })).toEqual(['users', ':id']);
  });

  it('ignores an empty version', () => {
    expect(buildRouteSegments({ version: '', controllerPath: 'users' })).toEqual(['users']);
  });
});

describe('toOpenApiPath', () => {
  it('converts Nest parameters to OpenAPI syntax', () => {
    expect(toOpenApiPath(['users', ':id'])).toBe('/users/{id}');
  });

  it('leaves already-converted parameters alone', () => {
    expect(toOpenApiPath(['users', '{id}'])).toBe('/users/{id}');
  });

  it('renders the root path', () => {
    expect(toOpenApiPath([])).toBe('/');
  });
});

describe('requestSegments', () => {
  it('drops leading and trailing slashes', () => {
    expect(requestSegments('/users/42/')).toEqual(['users', '42']);
  });

  it('returns nothing for the root path', () => {
    expect(requestSegments('/')).toEqual([]);
  });
});

describe('compareSpecificity', () => {
  it('ranks a literal ahead of a parameter', () => {
    expect(compareSpecificity(['users', 'me'], ['users', ':id'])).toBeLessThan(0);
  });

  it('is symmetric', () => {
    expect(compareSpecificity(['users', ':id'], ['users', 'me'])).toBeGreaterThan(0);
  });

  it('compares at the earliest differing position', () => {
    // `:org` vs `acme` decides the order before the later segments matter.
    expect(compareSpecificity(['acme', ':id'], [':org', 'fixed'])).toBeLessThan(0);
  });

  it('treats equally shaped routes as equal', () => {
    expect(compareSpecificity(['users', ':id'], ['orgs', ':id'])).toBe(0);
  });

  it('sorts a realistic route table most-specific-first', () => {
    const table = [
      ['users', ':id'],
      ['users', 'me'],
      ['users', ':id', 'posts'],
    ];

    const sorted = [...table].sort(compareSpecificity);

    expect(sorted[0]).toEqual(['users', 'me']);
  });
});
