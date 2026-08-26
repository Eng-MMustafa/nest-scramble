/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import {
  Controller,
  Get,
  Header,
  Inject,
  InternalServerErrorException,
  Optional,
  SetMetadata,
  Type,
} from '@nestjs/common';
import { renderDocsPage } from '../utils/DocsPageRenderer';
import { ScrambleLogger } from '../utils/ScrambleLogger';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Normalises a user-supplied docs path into a Nest route segment.
 * `'/api/docs'`, `'api/docs/'` and `'api/docs'` all become `'api/docs'`.
 */
export function normalizeDocsPath(path: string | undefined): string {
  const normalized = (path || '').replace(/^\/+|\/+$/g, '').trim();
  return normalized || 'docs';
}

/**
 * Builds the docs controller for a specific configuration.
 *
 * The routes must be created at runtime because the `path` option is only known
 * once `forRoot()` has run. A statically decorated class would hard-code
 * `/docs` and silently ignore the option.
 */
export function createDocsController(config: { path?: string } = {}): Type<any> {
  const docsPath = normalizeDocsPath(config.path);

  @Controller()
  @Public()
  class DocsController {
    constructor(
      @Inject('NEST_SCRAMBLE_OPENAPI') private openApiSpec: any,
      @Inject('NEST_SCRAMBLE_OPTIONS') private options: any,
      @Optional() @Inject('NEST_SCRAMBLE_WS') private wsDocument: any,
    ) {}

    @Get(docsPath)
    @Header('Content-Type', 'text/html; charset=utf-8')
    getDocs(): string {
      return renderDocsPage({
        specUrl: `/${docsPath}-json`,
        title: this.options?.apiTitle ? `${this.options.apiTitle} — API Documentation` : undefined,
        primaryColor: this.options?.primaryColor,
        theme: this.options?.theme,
        faviconUrl: this.options?.customDomainIcon || undefined,
        scalarUrl: this.options?.scalarUrl,
      });
    }

    @Get(`${docsPath}-json`)
    @Header('Content-Type', 'application/json; charset=utf-8')
    @Header('Access-Control-Allow-Origin', '*')
    getOpenApiJson(): string {
      return this.serializeSpec();
    }

    @Get(`${docsPath}/json`)
    @Header('Content-Type', 'application/json; charset=utf-8')
    @Header('Access-Control-Allow-Origin', '*')
    getOpenApiJsonLegacy(): string {
      return this.serializeSpec();
    }

    @Get(`${docsPath}/spec`)
    getOpenApiSpec() {
      return this.openApiSpec;
    }

    /**
     * WebSocket gateway documentation. `gateways` is empty when the project
     * has none, so the docs UI knows to hide the section.
     */
    @Get(`${docsPath}-ws-json`)
    @Header('Content-Type', 'application/json; charset=utf-8')
    @Header('Access-Control-Allow-Origin', '*')
    getWsJson(): string {
      return JSON.stringify(this.wsDocument || { gateways: [] }, null, 2);
    }

    /**
     * Returns the document pretty-printed.
     *
     * A string is returned rather than the object so the JSON stays readable when
     * opened directly in a browser. Both adapters send strings verbatim.
     */
    private serializeSpec(): string {
      try {
        return JSON.stringify(this.openApiSpec, null, 2);
      } catch (error) {
        ScrambleLogger.error('Error serializing OpenAPI spec:', error);
        throw new InternalServerErrorException('Failed to generate OpenAPI specification');
      }
    }
  }

  return DocsController;
}

/**
 * Default docs controller bound to `/docs`.
 *
 * @deprecated Use {@link createDocsController} so the `path` option is honoured.
 */
export const DocsController = createDocsController();

