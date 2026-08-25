/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import { DynamicModule, MiddlewareConsumer, Module, OnModuleInit, RequestMethod, Inject } from '@nestjs/common';
import { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } from './nest-scramble.module-definition';
import { PostmanCollectionGenerator } from './generators/PostmanCollectionGenerator';
import { MOCK_GLOBAL_PREFIX, MockMiddleware } from './middleware/MockMiddleware';
import { ScannerService } from './scanner/ScannerService';
import { IncrementalScannerService } from './scanner/IncrementalScannerService';
import { MockGenerator } from './utils/MockGenerator';
import { OpenApiTransformer } from './utils/OpenApiTransformer';
import { createDocsController, normalizeDocsPath } from './controllers/DocsController';
import { AutoDetector } from './utils/AutoDetector';
import { buildWildcardRoute } from './utils/NestCompat';
import { LogLevel, ScrambleLogger } from './utils/ScrambleLogger';
import * as fs from 'fs';

export const MOCK_ROUTE_PREFIX = 'scramble-mock';

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
  /**
   * @deprecated Not implemented by the module and ignored. Watch mode works,
   * but only through the programmatic `WatchModeService`, which regenerates
   * artefacts outside the request lifecycle. Setting this here has no effect.
   * @see WatchModeService
   */
  enableWatchMode?: boolean;
  /**
   * @deprecated Not implemented by the module and ignored. Pass `debounceMs`
   * to `WatchModeService` instead.
   * @see WatchModeService
   */
  watchDebounce?: number;
  skipDependencyTracking?: boolean;
  /**
   * @deprecated Not implemented and ignored. Choose the hash strength with
   * `hashAlgorithm: 'sha256'` instead.
   */
  enableHashCollisionDetection?: boolean;
  /**
   * @deprecated Not implemented and ignored. The generated document contains
   * no `securitySchemes`, so there is nothing for this to apply to.
   */
  defaultAuthType?: 'bearer' | 'apiKey' | 'none';
  /**
   * @deprecated Not implemented and ignored. To version the documented paths,
   * pass the prefix you gave `app.setGlobalPrefix()` via `globalPrefix`.
   */
  enableApiVersioning?: boolean;
  /**
   * Full URL of the Scalar standalone bundle. Override to self-host the asset
   * instead of loading it from the public CDN (required in air-gapped setups).
   */
  scalarUrl?: string;
  /**
   * Controls library output. Use `'silent'` to suppress it entirely.
   * @default 'info'
   */
  logLevel?: LogLevel;
  /**
   * Mirrors the value passed to `app.setGlobalPrefix()`.
   *
   * Static analysis cannot see the `bootstrap()` call, so without this every
   * generated path is missing the prefix and does not match the running API.
   */
  globalPrefix?: string;
}

@Module({})
export class NestScrambleModule extends ConfigurableModuleClass implements OnModuleInit {
  private static moduleOptions: NestScrambleOptions = {};
  private static docsPath = 'docs';
  private static controllerCount = 0;

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
    if (!ScrambleLogger.isEnabled('info')) return;

    const options = NestScrambleModule.moduleOptions;
    const baseUrl = options.baseUrl;
    const docsPath = NestScrambleModule.docsPath;

    const cyan = '\x1b[36m';
    const purple = '\x1b[35m';
    const green = '\x1b[32m';
    const yellow = '\x1b[33m';
    const bold = '\x1b[1m';
    const reset = '\x1b[0m';
    const dim = '\x1b[2m';
    const gradient = `${cyan}${bold}`;

    const lines: string[] = [];
    const rule = '─'.repeat(59);

    lines.push('');
    lines.push(`${gradient}┌${rule}┐${reset}`);
    lines.push(`${gradient}│${reset} ${cyan}${bold}✨ NEST-SCRAMBLE${reset} ${dim}by Mohamed Mustafa${reset}`);
    lines.push(`${gradient}│${reset}`);
    lines.push(`${gradient}│${reset} ${green}●${reset} ${bold}Documentation${reset}  ${cyan}${baseUrl}/${docsPath}${reset}`);
    lines.push(`${gradient}│${reset} ${green}●${reset} ${bold}OpenAPI Spec${reset}   ${cyan}${baseUrl}/${docsPath}-json${reset}`);
    if (options.enableMock !== false) {
      lines.push(
        `${gradient}│${reset} ${green}●${reset} ${bold}Mock Server${reset}    ${cyan}${baseUrl}/${MOCK_ROUTE_PREFIX}${reset}`,
      );
    }
    lines.push(`${gradient}│${reset}`);
    lines.push(`${gradient}│${reset} ${yellow}📦${reset} Source      ${dim}${options.sourcePath}${reset}`);
    lines.push(
      `${gradient}│${reset} ${yellow}🎯${reset} Controllers ${green}${bold}${NestScrambleModule.controllerCount}${reset}`,
    );
    lines.push(
      `${gradient}│${reset} ${yellow}🎨${reset} Theme       ${options.theme === 'classic' ? `${dim}Classic${reset}` : `${purple}${bold}Futuristic${reset}`}`,
    );
    lines.push(`${gradient}└${rule}┘${reset}`);
    lines.push('');

    ScrambleLogger.raw(lines);
  }

  /**
   * Options the module still accepts for backwards compatibility but does not
   * act on. Kept as one list so the type, the warning and the test that guards
   * against new dead options cannot drift apart.
   */
  static readonly IGNORED_OPTIONS: ReadonlyMap<keyof NestScrambleOptions, string> = new Map([
    ['enableWatchMode', 'use the programmatic WatchModeService instead'],
    ['watchDebounce', 'pass debounceMs to WatchModeService instead'],
    ['enableHashCollisionDetection', "use hashAlgorithm: 'sha256' instead"],
    ['defaultAuthType', 'the generated document declares no security schemes'],
    ['enableApiVersioning', 'pass your app prefix via globalPrefix instead'],
  ]);

  /**
   * An option that is accepted, type-checked and then ignored is worse than one
   * that does not exist: the caller sees no effect and has no way to find out
   * why. Saying so out loud costs one line at startup.
   */
  private static warnAboutIgnoredOptions(options: NestScrambleOptions): void {
    for (const [option, advice] of NestScrambleModule.IGNORED_OPTIONS) {
      if (options[option] !== undefined) {
        ScrambleLogger.warn(`Option "${String(option)}" is not implemented and is ignored — ${advice}.`);
      }
    }
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
      scalarUrl: options.scalarUrl,
      logLevel: options.logLevel || 'info',
      globalPrefix: options.globalPrefix || '',
    };

    ScrambleLogger.configure(config.logLevel);
    NestScrambleModule.warnAboutIgnoredOptions(options);

    NestScrambleModule.moduleOptions = config;
    NestScrambleModule.docsPath = normalizeDocsPath(config.path);

    ScrambleLogger.debug(`Project root: ${projectStructure.rootPath}`);
    ScrambleLogger.debug(`Source path: ${config.sourcePath}`);
    ScrambleLogger.debug(`tsconfig: ${projectStructure.tsConfigPath}`);

    let scanner: ScannerService | IncrementalScannerService;
    let controllers: any[];

    if (config.useIncrementalScanning) {
      ScrambleLogger.debug('Using incremental scanner with caching');
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
      ScrambleLogger.debug(
        `Cache: ${cacheStats.controllerCount} controllers, ${cacheStats.hashAlgorithm} algorithm`,
      );
    } else {
      scanner = new ScannerService();
      controllers = scanner.scanControllers(config.sourcePath);
    }

    NestScrambleModule.controllerCount = controllers.length;

    if (controllers.length === 0) {
      ScrambleLogger.warn(
        `No controllers found in "${config.sourcePath}". ` +
          'Check the `sourcePath` option points at the directory containing your @Controller() classes.',
      );
    }

    const transformer = new OpenApiTransformer(config.baseUrl, config.globalPrefix);
    const openApiSpec = transformer.transform(
      controllers,
      config.apiTitle,
      config.apiVersion,
      config.baseUrl
    );
    ScrambleLogger.debug('OpenAPI specification generated');

    if (config.autoExportPostman) {
      const generator = new PostmanCollectionGenerator(config.baseUrl);
      const collection = generator.generateCollection(controllers);
      fs.writeFileSync(config.postmanOutputPath, JSON.stringify(collection, null, 2));
      ScrambleLogger.info(`Postman collection exported to ${config.postmanOutputPath}`);
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
          // The mock must answer on the same paths the document advertises.
          provide: MOCK_GLOBAL_PREFIX,
          useValue: config.globalPrefix,
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
      controllers: [createDocsController({ path: config.path })],
    };
  }

  configure(consumer: MiddlewareConsumer) {
    if (NestScrambleModule.moduleOptions.enableMock === false) {
      return;
    }

    // The route pattern differs between Express 4 (NestJS 10) and Express 5
    // (NestJS 11), where anonymous `*` wildcards are rejected outright.
    consumer
      .apply(MockMiddleware)
      .forRoutes({ path: buildWildcardRoute(MOCK_ROUTE_PREFIX), method: RequestMethod.ALL });
  }
}