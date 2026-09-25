/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import { ExpressControllerInfo, ExpressRouteInfo } from './ExpressScanner';
import { bodySchemaName } from './ExpressNaming';

export interface OpenApiSpec {
  openapi: string;
  info: { title: string; version: string; description?: string };
  servers: { url: string }[];
  paths: Record<string, Record<string, any>>;
  components: { schemas: Record<string, any> };
}

/**
 * Converts heuristic Express route information into a minimal, valid OpenAPI
 * 3.0 document that the built-in docs UI can render and interact with.
 */
export class ExpressOpenApiTransformer {
  transform(
    controllers: ExpressControllerInfo[],
    title = 'Express API',
    version = '1.0.0',
    baseUrl = 'http://localhost:3000',
  ): OpenApiSpec {
    const paths: Record<string, Record<string, any>> = {};
    const schemas: Record<string, any> = {};
    let hasAuth = false;

    for (const controller of controllers) {
      const tag = controller.name;

      for (const route of controller.routes) {
        const httpMethod = route.method === 'all' ? 'get' : route.method;
        const openApiPath = '/' + route.path.replace(/^\/+/, '');

        if (!paths[openApiPath]) {
          paths[openApiPath] = {};
        }

        const operation: any = {
          tags: route.tags || [tag],
          summary: route.summary || `${httpMethod.toUpperCase()} ${openApiPath}`,
          description: route.description,
          operationId: this.operationId(tag, route),
          parameters: route.parameters || [],
          responses: route.responses || { '200': { description: 'OK' } },
        };

        if (route.consumes || route.bodySchema) {
          const contentType = route.consumes?.[0] || 'application/json';
          let schema: any = {};
          if (route.bodySchema) {
            const inline = { type: 'object', properties: route.bodySchema.properties, required: route.bodySchema.required };
            // Inferred JSON bodies become named components so they show up in
            // the Schemas browser exactly like NestJS DTOs do.
            schema = contentType === 'application/json'
              ? { $ref: `#/components/schemas/${this.registerSchema(schemas, bodySchemaName(httpMethod, openApiPath), inline)}` }
              : inline;
          }

          operation.requestBody = {
            content: { [contentType]: { schema } },
          };

          if (route.hasFileUpload && contentType === 'multipart/form-data') {
            operation.requestBody.content['multipart/form-data'].schema = {
              type: 'object',
              properties: { image: { type: 'string', format: 'binary' } },
              required: ['image'],
            };
          }
        }

        if (route.security) {
          operation.security = route.security;
          hasAuth = true;
        }

        paths[openApiPath][httpMethod] = operation;
      }
    }

    const components: any = { schemas };
    if (hasAuth) {
      components.securitySchemes = {
        bearerAuth: { type: 'http', scheme: 'bearer' },
      };
    }

    return {
      openapi: '3.0.0',
      info: { title, version, description: 'Auto-generated from Express route files.' },
      servers: [{ url: baseUrl }],
      paths,
      components,
    };
  }

  /** Adds a schema under `name`, suffixing on collision with a different shape. */
  private registerSchema(schemas: Record<string, any>, name: string, schema: any): string {
    const serialized = JSON.stringify(schema);
    let candidate = name;
    let counter = 2;
    while (schemas[candidate] && JSON.stringify(schemas[candidate]) !== serialized) {
      candidate = `${name}${counter++}`;
    }
    schemas[candidate] = schema;
    return candidate;
  }

  private operationId(tag: string, route: ExpressRouteInfo): string {
    const safePath = route.path.replace(/[{}:/]/g, '_').replace(/\//g, '_');
    return `${tag}_${route.method}${safePath}`.replace(/_+/g, '_');
  }
}
