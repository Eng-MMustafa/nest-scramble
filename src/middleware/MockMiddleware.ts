/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import { Inject, Injectable, NestMiddleware, Optional } from '@nestjs/common';
import { ControllerInfo, MethodInfo } from '../scanner/ScannerService';
import { MockGenerator } from '../utils/MockGenerator';
import {
  buildRouteSegments,
  compareSpecificity,
  isParamSegment,
  paramName,
  requestSegments,
} from '../utils/RoutePath';

/** Injection token carrying the prefix so the mock matches the documented paths. */
export const MOCK_GLOBAL_PREFIX = 'NEST_SCRAMBLE_MOCK_GLOBAL_PREFIX';

export const MOCK_PATH_PREFIX = '/scramble-mock';

/** Statuses that must not carry a response body. */
const BODILESS_STATUSES = new Set([204, 205, 304]);

/**
 * Extracts the pathname of a request without depending on the HTTP adapter.
 *
 * Express decorates the request with `path`, but Fastify middleware receives the
 * raw Node request, which only exposes `url` including the query string. Relying
 * on `path` alone made the mock silently unreachable on Fastify.
 */
function requestPath(req: any): string {
  if (typeof req?.path === 'string') return req.path;

  const url: string = req?.originalUrl ?? req?.url ?? '';
  const queryStart = url.indexOf('?');
  return queryStart === -1 ? url : url.slice(0, queryStart);
}

/**
 * Writes a JSON response through the raw Node API.
 *
 * `res.status().json()` is an Express convenience that does not exist on the
 * `ServerResponse` handed to Fastify middleware. `statusCode`, `setHeader` and
 * `end` are part of Node core, so both adapters accept them.
 */
function sendJson(res: any, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

interface CompiledRoute {
  controller: ControllerInfo;
  method: MethodInfo;
  segments: string[];
  /** `true` for `@All()`, which responds to every verb. */
  matchesAnyVerb: boolean;
}

@Injectable()
export class MockMiddleware implements NestMiddleware {
  private readonly routes: CompiledRoute[];

  constructor(
    @Inject('NEST_SCRAMBLE_CONTROLLERS') private controllers: ControllerInfo[],
    @Optional() @Inject(MOCK_GLOBAL_PREFIX) globalPrefix?: string,
  ) {
    this.routes = this.compileRoutes(globalPrefix || '');
  }

  use(req: any, res: any, next: any) {
    const path = requestPath(req);

    if (path !== MOCK_PATH_PREFIX && !path.startsWith(`${MOCK_PATH_PREFIX}/`)) {
      return next();
    }

    const apiPath = path.slice(MOCK_PATH_PREFIX.length) || '/';
    const match = this.findMatchingRoute(apiPath, req.method);

    if (!match) {
      return sendJson(res, 404, {
        error: 'Route not found in scanned controllers',
        path: apiPath,
        method: req.method,
      });
    }

    const statusCode = this.getStatusCode(match.route.method);

    // A 204/205/304 response must not carry a body.
    if (BODILESS_STATUSES.has(statusCode)) {
      res.statusCode = statusCode;
      return res.end();
    }

    sendJson(res, statusCode, MockGenerator.generateMock(match.route.method.returnType));
  }

  /**
   * Flattens the scanned controllers into a route table, sorted so that the most
   * specific route is considered first.
   */
  private compileRoutes(globalPrefix: string): CompiledRoute[] {
    const routes: CompiledRoute[] = [];

    for (const controller of this.controllers) {
      for (const method of controller.methods) {
        routes.push({
          controller,
          method,
          // Built through the shared helper so the mock answers on exactly the
          // path that appears in the generated document.
          segments: buildRouteSegments({
            globalPrefix,
            version: method.version || controller.version,
            controllerPath: controller.path,
            methodRoute: method.route,
          }),
          matchesAnyVerb: method.httpMethod.toUpperCase() === 'ALL',
        });
      }
    }

    return routes.sort((a, b) => compareSpecificity(a.segments, b.segments));
  }

  /**
   * Resolves a request to the most specific matching route.
   *
   * NestJS itself resolves overlapping routes in declaration order, so an app
   * that declares `@Get(':id')` before `@Get('me')` never reaches `me`. The mock
   * deliberately prefers the more specific route instead: returning the `:id`
   * payload for a request to a literal `me` route is never the useful answer for
   * a documentation tool, and it silently misled anyone reading the response.
   */
  private findMatchingRoute(
    path: string,
    verb: string,
  ): { route: CompiledRoute; params: Record<string, string> } | null {
    const requested = requestSegments(path);
    const normalizedVerb = (verb || '').toUpperCase();

    for (const route of this.routes) {
      if (!route.matchesAnyVerb && route.method.httpMethod.toUpperCase() !== normalizedVerb) {
        continue;
      }

      const params = this.matchSegments(route.segments, requested);
      if (params) {
        return { route, params };
      }
    }

    return null;
  }

  /** Returns the extracted path parameters, or `null` when the route does not match. */
  private matchSegments(routeSegments: string[], requested: string[]): Record<string, string> | null {
    if (routeSegments.length !== requested.length) return null;

    const params: Record<string, string> = {};

    for (let i = 0; i < routeSegments.length; i++) {
      const segment = routeSegments[i];

      if (isParamSegment(segment)) {
        params[paramName(segment)] = requested[i];
        continue;
      }

      if (segment !== requested[i]) return null;
    }

    return params;
  }

  /** Honours `@HttpCode()` before falling back to the NestJS convention. */
  private getStatusCode(method: MethodInfo): number {
    if (method.httpCode !== undefined) return method.httpCode;

    switch (method.httpMethod.toUpperCase()) {
      case 'POST':
        return 201;
      default:
        return 200;
    }
  }
}