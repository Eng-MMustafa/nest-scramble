/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import { ControllerInfo, MethodInfo } from '../scanner/ScannerService';
import { AnalyzedType } from './DtoAnalyzer';
import { ValidationConstraints } from './ValidationExtractor';
import { buildRouteSegments, toOpenApiPath } from './RoutePath';
import { sanitizeTypeName } from './SchemaName';

/** Verbs that `@All()` expands to in the generated document. */
const ALL_METHOD_VERBS = ['get', 'post', 'put', 'patch', 'delete'];

interface OpenApiSpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description: string;
  };
  servers: Array<{
    url: string;
  }>;
  tags?: Array<{
    name: string;
    description?: string;
  }>;
  paths: Record<string, Record<string, any>>;
  components: {
    schemas: Record<string, any>;
    securitySchemes?: Record<string, any>;
  };
}

export class OpenApiTransformer {
  private schemas: Record<string, any> = {};
  /**
   * Maps `name|fingerprint` to the component name actually assigned, so two
   * DTOs that share a class name but not a shape get distinct entries instead
   * of the first silently winning.
   */
  private assignedSchemaNames = new Map<string, string>();
  private baseUrl: string;
  private globalPrefix: string;

  /**
   * @param baseUrl Server URL advertised in the document
   * @param globalPrefix Value passed to `app.setGlobalPrefix()`. Without it every
   *   generated path is wrong for applications that use a prefix.
   */
  constructor(baseUrl = 'http://localhost:3000', globalPrefix = '') {
    this.baseUrl = baseUrl;
    this.globalPrefix = globalPrefix.replace(/^\/+|\/+$/g, '');
  }

  /**
   * Transforms ControllerInfo array into OpenAPI 3.0.0 specification
   * @param controllers Array of controller information
   * @param title API title
   * @param version API version
   * @param baseUrl Base URL for the API
   * @returns OpenAPI specification object
   */
  transform(controllers: ControllerInfo[], title = 'NestJS API', version = '1.0.0', baseUrl = 'http://localhost:3000'): OpenApiSpec {
    this.schemas = {};
    this.assignedSchemaNames.clear();
    const paths: Record<string, Record<string, any>> = {};
    const tags = controllers.map(controller => ({
      name: this.getControllerTagName(controller),
      description: controller.path ? `Routes under /${controller.path}` : 'Routes without a controller base path',
    }));

    for (const controller of controllers) {
      for (const method of controller.methods) {
        const methodVersion = method.version || controller.version;
        const fullPath = this.buildPath(controller.path, method.route, methodVersion);
        const requiresAuth = this.requiresAuthentication(method, controller);
        const guardTypes = this.getEffectiveGuardTypes(method, controller);
        const operation = this.createOperation(method, controller, requiresAuth, guardTypes);

        if (!paths[fullPath]) {
          paths[fullPath] = {};
        }

        const verb = method.httpMethod.toLowerCase();

        if (verb === 'all') {
          // OpenAPI has no "any method" verb, so expand it.
          for (const expanded of ALL_METHOD_VERBS) {
            if (!paths[fullPath][expanded]) {
              paths[fullPath][expanded] = operation;
            }
          }
        } else {
          paths[fullPath][verb] = operation;
        }
      }
    }

    return {
      openapi: '3.0.0',
      info: {
        title,
        version,
        description: 'Generated from NestJS controllers using nest-scramble',
      },
      servers: [
        {
          url: baseUrl,
        },
      ],
      tags,
      paths,
      components: {
        schemas: this.schemas,
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Enter your Bearer token in the format: Bearer <token>',
          },
          apiKey: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key',
            description: 'API Key for authentication',
          },
        },
      },
    };
  }

  private buildPath(controllerPath: string, methodRoute: string, version?: string | string[]): string {
    return toOpenApiPath(
      buildRouteSegments({
        globalPrefix: this.globalPrefix,
        version,
        controllerPath,
        methodRoute,
      }),
    );
  }

  private requiresAuthentication(method: MethodInfo, controller: ControllerInfo): boolean {
    if (method.isPublic) return false;
    if (controller.isPublic && !method.hasGuards) return false;
    if (method.hasGuards) return true;
    if (controller.hasGuards && !method.isPublic) return true;
    return false;
  }

  private getEffectiveGuardTypes(method: MethodInfo, controller: ControllerInfo): string[] {
    if (method.guardTypes && method.guardTypes.length > 0) {
      return method.guardTypes;
    }
    
    if (controller.guardTypes && controller.guardTypes.length > 0) {
      return controller.guardTypes;
    }
    
    return [];
  }

  private determineSecurityScheme(guardTypes: string[]): string {
    for (const guardType of guardTypes) {
      const lowerGuard = guardType.toLowerCase();
      
      if (lowerGuard.includes('jwt') || lowerGuard.includes('bearer')) {
        return 'bearerAuth';
      }
      
      if (lowerGuard.includes('apikey') || lowerGuard.includes('api-key')) {
        return 'apiKey';
      }
    }
    
    return 'bearerAuth';
  }

  private createOperation(method: MethodInfo, controller: ControllerInfo, requiresAuth: boolean, guardTypes: string[]): any {
    // An explicit `@HttpCode()` is authoritative; otherwise fall back to the
    // convention NestJS itself applies.
    const successStatusCode =
      method.httpCode !== undefined
        ? String(method.httpCode)
        : this.getSuccessStatusCode(method.httpMethod);
    const successDescription = this.getSuccessDescription(method.httpMethod);
    const isEmptyResponse = successStatusCode === '204';

    const operation: any = {
      operationId: `${controller.name}_${method.name}`,
      summary: method.summary || method.name,
      tags: [this.getControllerTagName(controller)],
      responses: {
        [successStatusCode]: isEmptyResponse
          ? { description: successDescription }
          : {
              description: successDescription,
              content: {
                'application/json': {
                  schema: this.analyzedTypeToSchema(method.returnType),
                },
              },
            },
        '400': {
          description: 'Bad Request',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  statusCode: { type: 'number', example: 400 },
                  message: { type: 'string', example: 'Bad Request' },
                  error: { type: 'string', example: 'Validation failed' },
                },
              },
            },
          },
        },
        '500': {
          description: 'Internal Server Error',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  statusCode: { type: 'number', example: 500 },
                  message: { type: 'string', example: 'Internal server error' },
                },
              },
            },
          },
        },
      },
    };

    const hasFileFields = (method.fileFields?.length ?? 0) > 0;

    const parameters: any[] = [];
    for (const param of method.parameters) {
      if (param.parameterLocation === 'file') {
        // Described by the multipart body below, not as a parameter.
        continue;
      } else if (param.parameterLocation === 'body') {
        // On an upload route the body fields travel as sibling form fields, so
        // they belong in the multipart schema rather than a JSON body.
        if (hasFileFields) continue;

        operation.requestBody = {
          required: true,
          content: {
            'application/json': {
              schema: this.analyzedTypeToSchema(param.type),
            },
          },
        };
      } else if (param.parameterLocation === 'query') {
        if (param.type.properties) {
          for (const prop of param.type.properties) {
            parameters.push({
              name: prop.name,
              in: 'query',
              schema: this.applyValidation(this.analyzedTypeToSchema(prop.type), prop.validation),
              required: !prop.type.isOptional,
              description: prop.description,
            });
          }
        } else {
          parameters.push({
            name: param.name,
            in: 'query',
            schema: this.analyzedTypeToSchema(param.type),
            required: !param.type.isOptional,
          });
        }
      } else if (param.parameterLocation === 'path') {
        parameters.push({
          name: param.name,
          in: 'path',
          required: true,
          schema: this.analyzedTypeToSchema(param.type),
        });
      } else if (param.parameterLocation === 'header') {
        parameters.push({
          name: param.name,
          in: 'header',
          schema: this.analyzedTypeToSchema(param.type),
          required: !param.type.isOptional,
        });
      }
    }

    if (hasFileFields) {
      operation.requestBody = this.buildMultipartRequestBody(method);
    }

    if (parameters.length > 0) {
      operation.parameters = parameters;
    }

    if (requiresAuth) {
      const securityScheme = this.determineSecurityScheme(guardTypes);
      operation.security = [
        {
          [securityScheme]: [],
        },
      ];
      
      operation.responses['401'] = {
        description: 'Unauthorized',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                statusCode: { type: 'number', example: 401 },
                message: { type: 'string', example: 'Unauthorized' },
              },
            },
          },
        },
      };
    }

    // Errors thrown directly in the method body. These carry the method's own
    // message, so they overwrite the blanket 400/500 defaults and the generic
    // guard-derived 401 above.
    for (const error of method.errorResponses ?? []) {
      const status = String(error.status);

      operation.responses[status] = {
        description: error.description,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                statusCode: { type: 'number', example: error.status },
                message: { type: 'string', example: error.description },
                error: { type: 'string' },
              },
            },
          },
        },
      };
    }

    if (method.description) {
      operation.description = method.description;
    }

    if (method.deprecated) {
      operation.deprecated = true;
    }

    operation['x-code-samples'] = this.generateCodeSamples(method);

    return operation;
  }

  /**
   * Builds a `multipart/form-data` request body for an upload route.
   *
   * File fields and any `@Body()` properties are siblings in a multipart
   * payload, so they are merged into one schema. Previously the upload parameter
   * matched no branch at all and the endpoint was documented with no body,
   * making it impossible to call from the docs UI.
   */
  private buildMultipartRequestBody(method: MethodInfo): any {
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const field of method.fileFields ?? []) {
      // `string`/`binary` is how OpenAPI 3.0 describes an uploaded file.
      const fileSchema = { type: 'string', format: 'binary' };

      properties[field.name] = field.multiple
        ? {
            type: 'array',
            items: fileSchema,
            ...(field.maxCount !== undefined ? { maxItems: field.maxCount } : {}),
          }
        : fileSchema;

      required.push(field.name);
    }

    const bodyParam = method.parameters.find(p => p.parameterLocation === 'body');

    for (const prop of bodyParam?.type.properties ?? []) {
      properties[prop.name] = this.applyValidation(
        this.analyzedTypeToSchema(prop.type),
        prop.validation,
      );

      if (prop.description) {
        properties[prop.name].description = prop.description;
      }

      if (!prop.type.isOptional) {
        required.push(prop.name);
      }
    }

    return {
      required: true,
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            properties,
            ...(required.length > 0 ? { required } : {}),
          },
        },
      },
    };
  }

  /**
   * Merges `class-validator` constraints into a property schema.
   *
   * These constraints are the actual API contract enforced by the validation
   * pipe, so omitting them produced specs that under-described the API.
   */
  private applyValidation(schema: any, validation: ValidationConstraints | undefined): any {
    if (!validation) return schema;

    // A `$ref` cannot carry sibling keywords in OpenAPI 3.0.
    if (schema.$ref) return schema;

    const target = schema.type === 'array' ? schema.items : schema;

    if (validation.format !== undefined) target.format = validation.format;
    if (validation.minLength !== undefined) target.minLength = validation.minLength;
    if (validation.maxLength !== undefined) target.maxLength = validation.maxLength;
    if (validation.pattern !== undefined) target.pattern = validation.pattern;
    if (validation.minimum !== undefined) target.minimum = validation.minimum;
    if (validation.maximum !== undefined) target.maximum = validation.maximum;
    if (validation.exclusiveMinimum !== undefined) target.exclusiveMinimum = validation.exclusiveMinimum;
    if (validation.exclusiveMaximum !== undefined) target.exclusiveMaximum = validation.exclusiveMaximum;
    if (validation.multipleOf !== undefined) target.multipleOf = validation.multipleOf;
    if (validation.enum !== undefined) target.enum = validation.enum;
    if (validation.isInteger) target.type = 'integer';

    // Array-level keywords belong on the array, not the item schema.
    if (schema.type === 'array') {
      if (validation.minItems !== undefined) schema.minItems = validation.minItems;
      if (validation.maxItems !== undefined) schema.maxItems = validation.maxItems;
      if (validation.uniqueItems) schema.uniqueItems = true;
    }

    return schema;
  }

  private getControllerTagName(controller: ControllerInfo): string {
    const name = controller.name || 'General';
    return name.replace(/Controller$/, '') || name;
  }

  private getSuccessStatusCode(httpMethod: string): string {
    switch (httpMethod.toUpperCase()) {
      case 'POST':
        return '201';
      case 'GET':
      case 'PUT':
      case 'PATCH':
      case 'DELETE':
      default:
        return '200';
    }
  }

  private getSuccessDescription(httpMethod: string): string {
    switch (httpMethod.toUpperCase()) {
      case 'POST':
        return 'Created';
      case 'GET':
        return 'Success';
      case 'PUT':
        return 'Updated';
      case 'PATCH':
        return 'Partially Updated';
      case 'DELETE':
        return 'Deleted';
      default:
        return 'Success';
    }
  }

  private analyzedTypeToSchema(type: AnalyzedType): any {
    if (type.isArray) {
      return {
        type: 'array',
        items: this.analyzedTypeToSchema({ ...type, isArray: false }),
      };
    }

    if (type.enumValues && type.enumValues.length > 0) {
      return {
        type: 'string',
        enum: type.enumValues,
        example: type.enumValues[0],
      };
    }

    if (type.unionTypes) {
      return {
        oneOf: type.unionTypes.map(t => this.typeStringToSchema(t)),
      };
    }

    if (type.properties) {
      const schema = this.buildObjectSchema(type);

      // Anonymous shapes (inline object literals) have no usable name, so
      // they are inlined instead of polluting the components section.
      const baseName = sanitizeTypeName(type.type);
      if (!baseName) {
        return schema;
      }

      return { $ref: `#/components/schemas/${this.registerSchema(baseName, schema)}` };
    }

    return this.typeStringToSchema(type.type);
  }

  /**
   * Registers a schema under `baseName`, appending a numeric suffix when a
   * different shape already owns the name. Identical shapes are reused, so
   * repeated references to the same DTO still collapse to one component.
   */
  private registerSchema(baseName: string, schema: any): string {
    const fingerprint = JSON.stringify(schema);
    const key = `${baseName}|${fingerprint}`;

    let assigned = this.assignedSchemaNames.get(key);
    if (!assigned) {
      assigned = baseName;
      let suffix = 2;
      while (this.schemas[assigned] && JSON.stringify(this.schemas[assigned]) !== fingerprint) {
        assigned = `${baseName}${suffix++}`;
      }
      this.schemas[assigned] = schema;
      this.assignedSchemaNames.set(key, assigned);
    }

    return assigned;
  }

  private buildObjectSchema(type: AnalyzedType): any {
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const prop of type.properties!) {
      const propSchema = this.applyValidation(
        this.analyzedTypeToSchema(prop.type),
        prop.validation,
      );

      // Add description from JSDoc if available
      if (prop.description) {
        propSchema.description = prop.description;
      }

      // Name-based examples only make sense for scalars. Arrays, nested
      // objects and refs used to get strings like '123 Main St' here, which
      // poisoned every consumer that trusts `example` (scenario generation,
      // code snippets, mock payloads). For scalars the name-based example
      // always wins over the generic 'sample string' placeholder — except for
      // enums, whose example is already a legal member.
      const isScalar = !propSchema.$ref && !propSchema.properties && !propSchema.oneOf
        && propSchema.type !== 'array' && propSchema.type !== 'object';
      if (isScalar && !propSchema.enum) {
        let smart = this.generateSmartExample(prop.name, prop.type.type, prop.type.enumValues);
        // Examples must satisfy the documented constraints.
        if (typeof smart === 'number') {
          if (typeof propSchema.minimum === 'number' && smart < propSchema.minimum) smart = propSchema.minimum;
          if (typeof propSchema.maximum === 'number' && smart > propSchema.maximum) smart = propSchema.maximum;
        }
        const compatible =
          (propSchema.type === 'string' && typeof smart === 'string') ||
          ((propSchema.type === 'number' || propSchema.type === 'integer') && typeof smart === 'number') ||
          (propSchema.type === 'boolean' && typeof smart === 'boolean') ||
          propSchema.type === undefined;
        if (compatible) {
          propSchema.example = smart;
        }
      }

      properties[prop.name] = propSchema;

      if (!prop.type.isOptional) {
        required.push(prop.name);
      }
    }

    // Create the schema with examples at the schema level — scalars only,
    // for the same reason as above.
    const schemaExample: Record<string, any> = {};
    for (const prop of type.properties!) {
      const propSchema = properties[prop.name];
      if (!prop.type.isOptional && propSchema.example !== undefined) {
        schemaExample[prop.name] = propSchema.example;
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
      example: schemaExample,
    };
  }

  /**
   * Builds the copy-paste samples shown in the docs UI.
   *
   * Every sample used to send a JSON body, even on a `GET` and even on an upload
   * route. Copying either one produced a request that could not work, so the
   * shape now follows what the endpoint actually accepts.
   */
  private generateCodeSamples(method: MethodInfo): any[] {
    const fullPath = this.buildPath('', method.route);
    const url = `${this.baseUrl}${fullPath}`;
    const verb = method.httpMethod.toUpperCase();

    const fileFields = method.fileFields ?? [];
    const hasBody = method.parameters.some(p => p.parameterLocation === 'body');
    const sendsJson = hasBody && fileFields.length === 0;

    if (fileFields.length > 0) {
      const curlParts = fileFields
        .map(field => `  -F "${field.name}=@/path/to/file"`)
        .join(' \\\n');

      const formLines = fileFields
        .map(field => `form.append('${field.name}', fileInput.files[0]);`)
        .join('\n');

      return [
        {
          lang: 'curl',
          source: `curl -X ${verb} "${url}" \\\n${curlParts}`,
        },
        {
          lang: 'javascript',
          // The Content-Type header is omitted on purpose: the browser adds it
          // together with the multipart boundary.
          source: `const form = new FormData();\n${formLines}\n\nfetch('${url}', {\n  method: '${verb}',\n  body: form,\n})\n  .then(response => response.json())\n  .then(data => console.log(data));`,
        },
      ];
    }

    if (!sendsJson) {
      return [
        {
          lang: 'curl',
          source: `curl -X ${verb} "${url}"`,
        },
        {
          lang: 'javascript',
          source: `fetch('${url}'${verb === 'GET' ? '' : `, { method: '${verb}' }`})\n  .then(response => response.json())\n  .then(data => console.log(data));`,
        },
      ];
    }

    return [
      {
        lang: 'curl',
        source: `curl -X ${verb} "${url}" \\\n  -H "Content-Type: application/json" \\\n  -d '{}'`,
      },
      {
        lang: 'javascript',
        source: `fetch('${url}', {\n  method: '${verb}',\n  headers: {\n    'Content-Type': 'application/json',\n  },\n  body: JSON.stringify({}),\n})\n  .then(response => response.json())\n  .then(data => console.log(data));`,
      },
    ];
  }

  private generateSmartExample(propertyName: string, propertyType: string, enumValues?: string[]): any {
    const lowerName = propertyName.toLowerCase();
    const lowerType = propertyType.toLowerCase();

    // If enum values are provided, return the first one
    if (enumValues && enumValues.length > 0) {
      return enumValues[0];
    }

    // Email patterns
    if (lowerName.includes('email')) {
      return 'user@example.com';
    }

    // Name patterns
    if (lowerName.includes('name') || lowerName === 'title') {
      return 'John Doe';
    }

    // Phone patterns
    if (lowerName.includes('phone') || lowerName.includes('mobile')) {
      return '+1234567890';
    }

    // Address patterns
    if (lowerName.includes('address') || lowerName.includes('street')) {
      return '123 Main St';
    }

    if (lowerName.includes('city')) {
      return 'New York';
    }

    if (lowerName.includes('country')) {
      return 'United States';
    }

    if (lowerName.includes('zip') || lowerName.includes('postal')) {
      return '10001';
    }

    // ID patterns
    if (lowerName === 'id' || lowerName.endsWith('id')) {
      return 1;
    }

    // Age pattern
    if (lowerName === 'age') {
      return 25;
    }

    // Price/Amount patterns
    if (lowerName.includes('price') || lowerName.includes('amount') || lowerName.includes('cost')) {
      return 99.99;
    }

    // URL patterns
    if (lowerName.includes('url') || lowerName.includes('link')) {
      return 'https://example.com';
    }

    // Description/Content patterns
    if (lowerName.includes('description') || lowerName.includes('content') || lowerName.includes('text')) {
      return 'Sample description text';
    }

    // Password pattern
    if (lowerName.includes('password')) {
      return 'SecurePassword123!';
    }

    // Username pattern
    if (lowerName.includes('username')) {
      return 'johndoe';
    }

    // Status pattern
    if (lowerName.includes('status')) {
      return 'active';
    }

    // Role pattern
    if (lowerName.includes('role')) {
      return 'user';
    }

    // Date patterns
    if (lowerName.includes('date') || lowerName.includes('createdat') || lowerName.includes('updatedat')) {
      return '2024-01-01T00:00:00.000Z';
    }

    // Type-based fallbacks
    if (lowerType.includes('number') || lowerType.includes('int') || lowerType.includes('float')) {
      return 0;
    }

    if (lowerType.includes('boolean')) {
      return true;
    }

    if (lowerType.includes('date')) {
      return '2024-01-01T00:00:00.000Z';
    }

    // Default to string
    return 'sample value';
  }

  private typeStringToSchema(type: string): any {
    const lowerType = type.toLowerCase();

    if (lowerType.includes('string')) {
      return { type: 'string', example: 'sample string' };
    }

    if (lowerType.includes('number') || lowerType.includes('int') || lowerType.includes('float')) {
      return { type: 'number', example: 0 };
    }

    if (lowerType.includes('boolean')) {
      return { type: 'boolean', example: true };
    }

    if (lowerType.includes('date')) {
      return { type: 'string', format: 'date-time', example: '2024-01-01T00:00:00.000Z' };
    }

    // Default to string
    return { type: 'string', example: 'value' };
  }
}