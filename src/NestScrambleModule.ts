/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import { DynamicModule, MiddlewareConsumer, Module, OnModuleInit, RequestMethod, Inject } from '@nestjs/common';
import { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } from './nest-scramble.module-definition';
import { PostmanCollectionGenerator } from './generators/PostmanCollectionGenerator';
import { MockMiddleware } from './middleware/MockMiddleware';
import { ScannerService } from './scanner/ScannerService';
import { IncrementalScannerService } from './scanner/IncrementalScannerService';
import { MockGenerator } from './utils/MockGenerator';
import { OpenApiTransformer } from './utils/OpenApiTransformer';
import { DocsController } from './controllers/DocsController';
import { AutoDetector } from './utils/AutoDetector';

export interface NestScrambleOptions {
  path?: string;
  enableMock?: boolean;
  autoExportPostman?: boolean;
  postmanOutputPath?: string;
  baseUrl?: string;
  sourcePath?: string;
  apiTitle?: string;
  apiVersion?: string;
  customDomainIcon?: string;
  primaryColor?: string;
  theme?: 'classic' | 'futuristic';
  useIncrementalScanning?: boolean;
  cacheFilePath?: string;
  hashAlgorithm?: 'md5' | 'sha256';
  cacheTtl?: number;
  enableWatchMode?: boolean;
  watchDebounce?: number;
  skipDependencyTracking?: boolean;
  enableHashCollisionDetection?: boolean;
  defaultAuthType?: 'bearer' | 'apiKey' | 'none';
  enableApiVersioning?: boolean;
}

@Module({})
export class NestScrambleModule extends ConfigurableModuleClass implements OnModuleInit {
  private static moduleOptions: NestScrambleOptions = {};

  constructor(
    @Inject(MODULE_OPTIONS_TOKEN)
    private readonly options: NestScrambleOptions,
  ) {
    super();
    NestScrambleModule.moduleOptions = options;
  }

  onModuleInit() {
    this.displayDashboard();
  }

  private displayDashboard() {
    const options = NestScrambleModule.moduleOptions;
    const projectStructure = AutoDetector.detectProjectStructure();
    const baseUrl = options.baseUrl;

    const cyan = '\x1b[36m';
    const purple = '\x1b[35m';
    const green = '\x1b[32m';
    const yellow = '\x1b[33m';
    const bold = '\x1b[1m';
    const reset = '\x1b[0m';
    const dim = '\x1b[2m';
    const gradient = `${cyan}${bold}`;

    console.log('\n');
    console.log(`${gradient}╔═══════════════════════════════════════════════════════════════╗${reset}`);
    console.log(`${gradient}║${reset}  ${cyan}${bold}✨ NEST-SCRAMBLE${reset} ${dim}by Mohamed Mustafa${reset}                      ${gradient}║${reset}`);
    console.log(`${gradient}║${reset}  ${purple}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${reset}  ${gradient}║${reset}`);
    console.log(`${gradient}║${reset}                                                               ${gradient}║${reset}`);
    console.log(`${gradient}║${reset}  ${green}●${reset} ${bold}Documentation${reset}                                           ${gradient}║${reset}`);
    console.log(`${gradient}║${reset}    ${cyan}→${reset} ${baseUrl}${options.path || '/docs'}                            ${gradient}║${reset}`);
    console.log(`${gradient}║${reset}                                                               ${gradient}║${reset}`);
    console.log(`${gradient}║${reset}  ${green}●${reset} ${bold}OpenAPI Spec${reset}                                            ${gradient}║${reset}`);
    console.log(`${gradient}║${reset}    ${cyan}→${reset} ${baseUrl}${options.path || '/docs'}-json                       ${gradient}║${reset}`);
    if (options.enableMock !== false) {
      console.log(`${gradient}║${reset}                                                               ${gradient}║${reset}`);
      console.log(`${gradient}║${reset}  ${green}●${reset} ${bold}Mock Server${reset}                                             ${gradient}║${reset}`);
      console.log(`${gradient}║${reset}    ${cyan}→${reset} ${baseUrl}/scramble-mock                  ${gradient}║${reset}`);
    }
    console.log(`${gradient}║${reset}                                                               ${gradient}║${reset}`);
    console.log(`${gradient}║${reset}  ${purple}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${reset}  ${gradient}║${reset}`);
    console.log(`${gradient}║${reset}  ${yellow}📦${reset} Source Path: ${dim}${projectStructure.sourcePath}${reset}                     ${gradient}║${reset}`);
    console.log(`${gradient}║${reset}  ${yellow}🎯${reset} Controllers: ${green}${bold}${projectStructure.controllerPaths.length}${reset}                                      ${gradient}║${reset}`);
    console.log(`${gradient}║${reset}  ${yellow}🎨${reset} Theme: ${options.theme === 'futuristic' ? `${purple}${bold}Futuristic${reset}` : `${dim}Classic${reset}`}                                   ${gradient}║${reset}`);
    console.log(`${gradient}╚═══════════════════════════════════════════════════════════════╝${reset}`);
    console.log(`\n  ${dim}Press Ctrl+C to stop the server${reset}\n`);
  }

  static forRoot(options: NestScrambleOptions = {}): DynamicModule {
    // Auto-detect project structure
    const projectStructure = AutoDetector.detectProjectStructure();
    
    const config = {
      path: options.path || '/docs',
      enableMock: options.enableMock !== undefined ? options.enableMock : true,
      autoExportPostman: options.autoExportPostman || false,
      postmanOutputPath: options.postmanOutputPath || 'collection.json',
      baseUrl: options.baseUrl || AutoDetector.detectBaseUrl(),
      sourcePath: options.sourcePath || projectStructure.sourcePath,
      apiTitle: options.apiTitle || AutoDetector.getAppName(),
      apiVersion: options.apiVersion || AutoDetector.getAppVersion(),
      customDomainIcon: options.customDomainIcon || '',
      primaryColor: options.primaryColor || '#00f2ff',
      theme: options.theme || 'futuristic',
      useIncrementalScanning: options.useIncrementalScanning || false,
      cacheFilePath: options.cacheFilePath || 'scramble-cache.json',
      hashAlgorithm: options.hashAlgorithm || 'md5',
      cacheTtl: options.cacheTtl || 24 * 60 * 60 * 1000,
      enableWatchMode: options.enableWatchMode || false,
      watchDebounce: options.watchDebounce || 300,
      skipDependencyTracking: options.skipDependencyTracking || false,
      enableHashCollisionDetection: options.enableHashCollisionDetection !== false,
    };

    NestScrambleModule.moduleOptions = config;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 [Nest-Scramble] Zero-Config Auto-Detection Engine`);
    console.log(`   Developed by Mohamed Mustafa | MIT License`);
    console.log(`   NestJS 10 & 11 | Node.js 18.10+ | TypeScript 5+`);
    console.log(`${'='.repeat(60)}`);
    console.log(`\n[Nest-Scramble] 🔍 Auto-detected project structure:`);
    console.log(`   Root: ${projectStructure.rootPath}`);
    console.log(`   Source: ${config.sourcePath}`);
    console.log(`   Config: ${projectStructure.tsConfigPath}`);

    let scanner: ScannerService | IncrementalScannerService;
    let controllers: any[];
    
    if (config.useIncrementalScanning) {
      console.log(`[Nest-Scramble] 🚀 Using Incremental Scanner with caching...`);
      scanner = new IncrementalScannerService({
        useCache: true,
        cacheFilePath: config.cacheFilePath,
        hashAlgorithm: config.hashAlgorithm || 'md5',
        cacheTtl: config.cacheTtl,
        skipDependencyTracking: config.skipDependencyTracking,
      });
      
      (scanner as IncrementalScannerService).initialize(config.sourcePath);
      controllers = (scanner as IncrementalScannerService).scanControllers(config.sourcePath);
      
      const cacheStats = (scanner as IncrementalScannerService).getCacheManager().getStats();
      console.log(`[Nest-Scramble] 📊 Cache: ${cacheStats.controllerCount} controllers, ${cacheStats.hashAlgorithm} algorithm`);
    } else {
      console.log(`[Nest-Scramble] 📦 Using Traditional Scanner...`);
      scanner = new ScannerService();
      controllers = scanner.scanControllers(config.sourcePath);
    }
    
    console.log(`\n[Nest-Scramble] 📦 Generating OpenAPI specification...`);
    const transformer = new OpenApiTransformer(config.baseUrl);
    const openApiSpec = transformer.transform(
      controllers,
      config.apiTitle,
      config.apiVersion,
      config.baseUrl
    );
    console.log(`[Nest-Scramble] ✅ OpenAPI spec generated successfully`);

    if (config.autoExportPostman) {
      console.log(`[Nest-Scramble] 📤 Exporting Postman collection...`);
      const generator = new PostmanCollectionGenerator(config.baseUrl);
      const collection = generator.generateCollection(controllers);
      require('fs').writeFileSync(config.postmanOutputPath, JSON.stringify(collection, null, 2));
      console.log(`[Nest-Scramble] ✓ Postman collection exported to ${config.postmanOutputPath}`);
    }

    // Get the base module from ConfigurableModuleBuilder
    const baseModule = super.forRoot(config);

    // Merge with our custom providers and controllers
    return {
      ...baseModule,
      providers: [
        ...(baseModule.providers || []),
        ScannerService,
        IncrementalScannerService,
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
          useValue: config,
        },
      ],
      exports: [
        ...(baseModule.exports || []),
        ScannerService,
        IncrementalScannerService,
        PostmanCollectionGenerator,
        OpenApiTransformer,
      ],
      controllers: [DocsController],
    };
  }

  /**
   * Modern async configuration support using ConfigurableModuleBuilder
   * Supports useFactory, useClass, and useExisting patterns
   */
  static forRootAsync = super.forRootAsync;

  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(MockMiddleware)
      .forRoutes({ path: 'scramble-mock/*', method: RequestMethod.ALL });
  }
}