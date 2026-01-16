/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import { ControllerInfo, MethodInfo } from '../scanner/ScannerService';
import { AnalyzedType } from './DtoAnalyzer';

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
  paths: Record<string, Record<string, any>>;
  components: {
    schemas: Record<string, any>;
    securitySchemes?: Record<string, any>;
  };
}

export class OpenApiTransformer {
  private schemas: Record<string, any> = {};
  private baseUrl: string;

  constructor(baseUrl = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
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

    const paths: Record<string, Record<string, any>> = {};

    for (const controller of controllers) {
      for (const method of controller.methods) {
        const fullPath = this.buildPath(controller.path, method.route);
        const operation = this.createOperation(method, controller.hasGuards);

        if (!paths[fullPath]) {
          paths[fullPath] = {};
        }

        paths[fullPath][method.httpMethod.toLowerCase()] = operation;
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
        },
      },
    };
  }

  private buildPath(controllerPath: string, methodRoute: string): string {
    const parts = [controllerPath, methodRoute].filter(p => p);
    return '/' + parts.join('/').replace(/\/+/g, '/');
  }

  private createOperation(method: MethodInfo, controllerHasGuards?: boolean): any {
    // Determine success status code based on HTTP method
    const successStatusCode = this.getSuccessStatusCode(method.httpMethod);
    const successDescription = this.getSuccessDescription(method.httpMethod);

    const operation: any = {
      summary: method.name,
      responses: {
        [successStatusCode]: {
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

    // Add parameters
    const parameters: any[] = [];
    for (const param of method.parameters) {
      if (param.parameterLocation === 'body') {
        operation.requestBody = {
          required: true,
          content: {
            'application/json': {
              schema: this.analyzedTypeToSchema(param.type),
            },
          },
        };
      } else if (param.parameterLocation === 'query') {
        // For query params, if it's an object, add properties as query params
        if (param.type.properties) {
          for (const prop of param.type.properties) {
            parameters.push({
              name: prop.name,
              in: 'query',
              schema: this.analyzedTypeToSchema(prop.type),
              required: !prop.type.isOptional,
              description: prop.description,
            });
          }
        } else {
          // Single query parameter
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

    if (parameters.length > 0) {
      operation.parameters = parameters;
    }

    // Add security requirements if method or controller has guards
    if (method.hasGuards || controllerHasGuards) {
      operation.security = [
        {
          bearerAuth: [],
        },
      ];
    }

    // Add code samples
    operation['x-code-samples'] = this.generateCodeSamples(method);

    return operation;
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

    if (type.unionTypes) {
      return {
        oneOf: type.unionTypes.map(t => this.typeStringToSchema(t)),
      };
    }

    if (type.properties) {
      const schemaName = type.type || 'Object';
      if (!this.schemas[schemaName]) {
        const properties: Record<string, any> = {};
        const required: string[] = [];

        for (const prop of type.properties) {
          const propSchema = this.analyzedTypeToSchema(prop.type);
          
          // Add description from JSDoc if available
          if (prop.description) {
            propSchema.description = prop.description;
          }
          
          // Add smart example based on property name
          if (!propSchema.example && !propSchema.$ref) {
            propSchema.example = this.generateSmartExample(prop.name, prop.type.type);
          }
          
          properties[prop.name] = propSchema;
          
          if (!prop.type.isOptional) {
            required.push(prop.name);
          }
        }

        this.schemas[schemaName] = {
          type: 'object',
          properties,
          required: required.length > 0 ? required : undefined,
        };
      }

      return {
        $ref: `#/components/schemas/${schemaName}`,
      };
    }

    return this.typeStringToSchema(type.type);
  }

  private generateCodeSamples(method: MethodInfo): any[] {
    const fullPath = this.buildPath('', method.route); // Assuming base path is handled elsewhere
    const samples = [];

    // Curl sample
    samples.push({
      lang: 'curl',
      source: `curl -X ${method.httpMethod} "${this.baseUrl}${fullPath}" \\\n  -H "Content-Type: application/json" \\\n  -d '{}'`,
    });

    // JavaScript Fetch sample
    samples.push({
      lang: 'javascript',
      source: `fetch('${this.baseUrl}${fullPath}', {\n  method: '${method.httpMethod}',\n  headers: {\n    'Content-Type': 'application/json',\n  },\n  body: JSON.stringify({}),\n})\n  .then(response => response.json())\n  .then(data => console.log(data));`,
    });

    // TypeScript sample
    samples.push({
      lang: 'typescript',
      source: `// Assuming you have the DTO types\nimport axios from 'axios';\n\nconst response = await axios.${method.httpMethod.toLowerCase()}('${this.baseUrl}${fullPath}', {});\nconsole.log(response.data);`,
    });

    return samples;
  }

  private generateSmartExample(propertyName: string, propertyType: string): any {
    const lowerName = propertyName.toLowerCase();
    const lowerType = propertyType.toLowerCase();

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