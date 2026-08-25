/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import { ControllerInfo, MethodInfo } from '../scanner/ScannerService';
import { MockGenerator } from '../utils/MockGenerator';

interface PostmanCollection {
  info: {
    name: string;
    description: string;
    schema: string;
  };
  item: PostmanItem[];
  variable?: PostmanVariable[];
}

interface PostmanItem {
  name: string;
  item?: PostmanItem[]; // for folders
  request?: PostmanRequest; // for requests
}

/** One entry of a `formdata` body; `file` entries carry a picker instead of a value. */
interface PostmanFormField {
  key: string;
  type: 'file' | 'text';
  value?: string;
  src?: string[];
}

interface PostmanRequest {
  method: string;
  header: PostmanHeader[];
  body?: {
    mode: string;
    raw?: string;
    formdata?: PostmanFormField[];
  };
  url: {
    raw: string;
    host: string[];
    path: string[];
    query?: PostmanQuery[];
  };
}

interface PostmanHeader {
  key: string;
  value: string;
  type?: string;
}

interface PostmanQuery {
  key: string;
  value: string;
  description?: string;
}

interface PostmanVariable {
  key: string;
  value: string;
  type: string;
}

export class PostmanCollectionGenerator {
  private baseUrl: string;

  constructor(baseUrl = '{{baseUrl}}') {
    this.baseUrl = baseUrl;
  }

  /**
   * Generates a Postman Collection from scanned controllers
   * @param controllers Array of controller information
   * @param collectionName Name of the collection
   * @returns Postman Collection JSON
   */
  generateCollection(controllers: ControllerInfo[], collectionName = 'NestJS API'): PostmanCollection {
    const items: PostmanItem[] = [];

    for (const controller of controllers) {
      const folder: PostmanItem = {
        name: controller.name,
        item: [],
      };

      for (const method of controller.methods) {
        const request = this.createRequest(controller, method);
        folder.item!.push({
          name: `${method.httpMethod} ${method.name}`,
          request,
        });
      }

      items.push(folder);
    }

    return {
      info: {
        name: collectionName,
        description: 'Generated from NestJS controllers using nest-scramble',
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      },
      item: items,
      variable: [
        {
          key: 'baseUrl',
          value: 'http://localhost:3000',
          type: 'string',
        },
      ],
    };
  }

  private createRequest(controller: ControllerInfo, method: MethodInfo): PostmanRequest {
    const fullPath = this.buildPath(controller.path, method.route);
    const url = this.parseUrl(fullPath);

    const request: PostmanRequest = {
      method: method.httpMethod,
      header: [
        {
          key: 'Content-Type',
          value: 'application/json',
          type: 'text',
        },
      ],
      url,
    };

    const bodyParam = method.parameters.find(p => p.decorator?.includes('@Body'));
    const fileFields = method.fileFields ?? [];

    if (fileFields.length > 0) {
      // A multipart endpoint rejects a raw JSON body, so the exported request
      // has to use Postman's formdata mode with a file picker per field.
      const formdata: PostmanFormField[] = fileFields.map(field => ({
        key: field.name,
        type: 'file',
        src: [],
      }));

      if (bodyParam?.type.properties) {
        const mockData = MockGenerator.generateMock(bodyParam.type);
        for (const [key, value] of Object.entries(mockData)) {
          formdata.push({ key, type: 'text', value: String(value) });
        }
      }

      request.body = { mode: 'formdata', formdata };

      // Postman sets the multipart boundary itself.
      request.header = request.header.filter(header => header.key !== 'Content-Type');
    } else if (bodyParam && bodyParam.type.properties) {
      const mockData = MockGenerator.generateMock(bodyParam.type);
      request.body = {
        mode: 'raw',
        raw: JSON.stringify(mockData, null, 2),
      };
    }

    // Add query params if there's a @Query parameter
    const queryParam = method.parameters.find(p => p.decorator?.includes('@Query'));
    if (queryParam && queryParam.type.properties) {
      const mockData = MockGenerator.generateMock(queryParam.type);
      request.url.query = Object.entries(mockData).map(([key, value]) => ({
        key,
        value: String(value),
      }));
    }

    return request;
  }

  private buildPath(controllerPath: string, methodRoute: string): string {
    const parts = [controllerPath, methodRoute].filter(p => p);
    return parts.join('/').replace(/\/+/g, '/');
  }

  private parseUrl(path: string): PostmanRequest['url'] {
    const segments = path.split('/').filter(s => s);
    const host = [this.baseUrl];
    const pathArray = segments;

    return {
      raw: `${this.baseUrl}/${segments.join('/')}`,
      host,
      path: pathArray,
    };
  }
}