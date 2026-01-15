/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import { DynamicModule, MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { PostmanCollectionGenerator } from './generators/PostmanCollectionGenerator';
import { MockMiddleware } from './middleware/MockMiddleware';
import { ScannerService } from './scanner/ScannerService';
import { MockGenerator } from './utils/MockGenerator';
import { OpenApiTransformer } from './utils/OpenApiTransformer';
import { DocsController } from './controllers/DocsController';

export interface NestScrambleOptions {
  path?: string;
  enableMock?: boolean;
  autoExportPostman?: boolean;
  postmanOutputPath?: string;
  baseUrl?: string;
  sourcePath?: string;
}

@Module({})
export class NestScrambleModule {
  static forRoot(options: NestScrambleOptions = {}): DynamicModule {
    const {
      path = '/docs',
      enableMock = true,
      autoExportPostman = false,
      postmanOutputPath = 'collection.json',
      baseUrl = 'http://localhost:3000',
      sourcePath = 'src',
    } = options;

    const scanner = new ScannerService();
    const controllers = scanner.scanControllers(sourcePath);
    const transformer = new OpenApiTransformer(baseUrl);
    const openApiSpec = transformer.transform(controllers, 'NestJS API', '1.0.0', baseUrl);

    if (autoExportPostman) {
      const generator = new PostmanCollectionGenerator(baseUrl);
      const collection = generator.generateCollection(controllers);
      require('fs').writeFileSync(postmanOutputPath, JSON.stringify(collection, null, 2));
      console.log(`[Nest-Scramble] Postman collection exported to ${postmanOutputPath}`);
    }

    const port = baseUrl.split(':').pop() || '3000';
    console.log(`\n🚀 [Nest-Scramble] Documentation engine initialized`);
    console.log(`📚 [Nest-Scramble] Docs available at http://localhost:${port}/docs`);
    console.log(`📄 [Nest-Scramble] OpenAPI JSON at http://localhost:${port}/docs/json\n`);

    return {
      module: NestScrambleModule,
      providers: [
        ScannerService,
        PostmanCollectionGenerator,
        OpenApiTransformer,
        MockGenerator,
        {
          provide: 'NEST_SCRAMBLE_CONTROLLERS',
          useValue: controllers,
        },
        {
          provide: 'NEST_SCRAMBLE_OPENAPI',
          useValue: openApiSpec,
        },
        {
          provide: 'NEST_SCRAMBLE_OPTIONS',
          useValue: options,
        },
      ],
      exports: [ScannerService, PostmanCollectionGenerator, OpenApiTransformer],
      controllers: [DocsController],
      imports: [],
    };
  }

  static forRootAsync(options: NestScrambleOptions = {}): DynamicModule {
    // Similar to forRoot but with async providers if needed
    return this.forRoot(options);
  }

  configure(consumer: MiddlewareConsumer) {
    // Apply mock middleware if enabled
    consumer
      .apply(MockMiddleware)
      .forRoutes({ path: 'scramble-mock/*', method: RequestMethod.ALL });
  }
}