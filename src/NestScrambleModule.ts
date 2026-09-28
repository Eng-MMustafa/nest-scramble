/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import { DynamicModule, MiddlewareConsumer, Module, OnModuleInit, RequestMethod, Inject } from '@nestjs/common';
import { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } from './nest-scramble.module-definition';
import { PostmanCollectionGenerator } from './generators/PostmanCollectionGenerator';
import { MOCK_GLOBAL_PREFIX, MockMiddleware } from './middleware/MockMiddleware';
import { DriftMiddleware } from './drift/DriftMiddleware';
import { ScannerService } from './scanner/ScannerService';
import { IncrementalScannerService } from './scanner/IncrementalScannerService';
import { MockGenerator } from './utils/MockGenerator';
import { OpenApiTransformer } from './utils/OpenApiTransformer';
import { createDocsController, normalizeDocsPath } from './controllers/DocsController';
import { buildWsDocument, GatewayScanner } from './websocket/GatewayScanner';
import { buildGraphQLDocument, ResolverScanner } from './graphql/ResolverScanner';
import { AutoDetector } from './utils/AutoDetector';
import { buildWildcardRoute } from './utils/NestCompat';
import { LogLevel, ScrambleLogger } from './utils/ScrambleLogger';
import * as fs from 'fs';

export const MOCK_ROUTE_PREFIX = 'scramble-mock';

/**
 * Check whether the current process appears to be running in a production
 * environment. We look at the standard NODE_ENV variable and also at common
 * PaaS flags (Render, Railway, Heroku, AWS Lambda, etc.) so the defaults feel
 * right regardless of how the app is deployed.
 */
function isProductionEnvironment(): boolean {
  const env = process.env.NODE_ENV || '';
  if (env === 'production') return true;
  const paasFlags = ['RENDER', 'RAILWAY', 'HEROKU', 'AWS_LAMBDA_FUNCTION_NAME', 'FLY_APP_NAME'];
  return paasFlags.some(flag => (process.env[flag] ?? '').length > 0);
}

export interface NestScrambleOptions {
  path?: string;
  /**
   * Enable the interactive docs UI and OpenAPI JSON endpoint.
   *
   * @default true in development, false in production (`NODE_ENV === 'production'`)
   *
   * In production the docs controller is **disabled by default** so that installing
   * the module does not accidentally expose your API surface to the public internet.
   * Set explicitly to `true` if you intentionally want docs reachable in production
   * (for example behind your own auth guard or on an internal network).
   */
  enableDocs?: boolean;
  /**
   * Enable the spec-driven mock server at `/scramble-mock/*`.
   *
   * @default true in development, false in production (`NODE_ENV === 'production'`)
   *
   * The mock server is intended for local development and contract-first testing.
   * It should not be left enabled in production unless you explicitly want to serve
   * fabricated responses from the same process as your real API.
   */
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
  /** @default 'sha256' */
  hashAlgorithm?: 'md5' | 'sha256';
  cacheTtl?: number;
  skipDependencyTracking?: boolean;
  /**
   * Opt-in: full URL of a Scalar standalone bundle. When set, the docs page
   * hosts the Scalar UI from that URL instead of the built-in zero-dependency
   * UI. Leave unset for a fully self-contained docs page.
   */
  scalarUrl?: string;
  /**
   * Opt-in drift detection: samples real JSON responses in development and
   * warns when they do not match the generated documentation (missing fields,
   * unexpected fields, type mismatches, undocumented routes/statuses).
   * Buffers response bodies (bounded), so keep it off in production.
   * @default false
   */
  enableDriftDetection?: boolean;
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
    const prefix = options.globalPrefix ? `/${options.globalPrefix.replace(/^\/+|\/+$/g, '')}` : '';

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
    if (options.enableDocs !== false) {
      lines.push(`${gradient}│${reset} ${green}●${reset} ${bold}Documentation${reset}  ${cyan}${baseUrl}${prefix}/${docsPath}${reset}`);
      lines.push(`${gradient}│${reset} ${green}●${reset} ${bold}OpenAPI Spec${reset}   ${cyan}${baseUrl}${prefix}/${docsPath}-json${reset}`);
    } else {
      lines.push(`${gradient}│${reset} ${yellow}○${reset} ${bold}Documentation${reset}  ${dim}disabled in production (enableDocs: true to opt in)${reset}`);
    }
    if (options.enableMock !== false) {
      lines.push(
        `${gradient}│${reset} ${green}●${reset} ${bold}Mock Server${reset}    ${cyan}${baseUrl}${prefix}/${MOCK_ROUTE_PREFIX}${reset}`,
      );
    } else {
      lines.push(`${gradient}│${reset} ${yellow}○${reset} ${bold}Mock Server${reset}    ${dim}disabled in production (enableMock: true to opt in)${reset}`);
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


  static forRoot(options: NestScrambleOptions = {}): DynamicModule {
    // Auto-detect project structure
    const projectStructure = AutoDetector.detectProjectStructure();

    // Secure-by-default: in production we disable docs and mock unless the
    // caller explicitly opts in. This prevents an npm install from silently
    // exposing the API surface (and an unauthenticated mock endpoint) to the
    // public internet when the host app is deployed.
    const isProduction = isProductionEnvironment();
    const enableDocsDefault = options.enableDocs !== undefined ? options.enableDocs : !isProduction;
    const enableMockDefault = options.enableMock !== undefined ? options.enableMock : !isProduction;

    if (isProduction && options.enableDocs === undefined) {
      ScrambleLogger.info(
        'Running in production mode. Docs UI is disabled by default; pass enableDocs: true to opt in.',
      );
    }
    if (isProduction && options.enableMock === undefined) {
      ScrambleLogger.info(
        'Running in production mode. Mock server is disabled by default; pass enableMock: true to opt in.',
      );
    }
    
    const config = {
      path: options.path || '/docs',
      enableDocs: enableDocsDefault,
      enableMock: enableMockDefault,
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
      hashAlgorithm: options.hashAlgorithm || 'sha256',
      cacheTtl: options.cacheTtl || 24 * 60 * 60 * 1000,
      skipDependencyTracking: options.skipDependencyTracking || false,
      scalarUrl: options.scalarUrl,
      enableDriftDetection: options.enableDriftDetection || false,
      logLevel: options.logLevel || 'info',
      globalPrefix: options.globalPrefix || '',
    };

    ScrambleLogger.configure(config.logLevel);

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
        hashAlgorithm: config.hashAlgorithm,
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

    // WebSocket gateways are documented alongside the HTTP routes. A project
    // without gateways gets an empty document, and the UI hides the section.
    let wsDocument: any = null;
    try {
      const gateways = new GatewayScanner().scanGateways(config.sourcePath);
      if (gateways.length > 0) {
        wsDocument = buildWsDocument(gateways, {
          title: config.apiTitle,
          version: config.apiVersion,
        });
        ScrambleLogger.debug(`Found ${gateways.length} WebSocket gateway(s)`);
      }
    } catch (error) {
      ScrambleLogger.warn(`Gateway scan failed: ${error instanceof Error ? error.message : error}`);
    }

    // GraphQL resolvers get the same treatment; empty document = hidden section.
    let graphqlDocument: any = null;
    try {
      const resolvers = new ResolverScanner().scanResolvers(config.sourcePath);
      if (resolvers.length > 0) {
        graphqlDocument = buildGraphQLDocument(resolvers, {
          title: config.apiTitle,
          version: config.apiVersion,
        });
        ScrambleLogger.debug(`Found ${resolvers.length} GraphQL resolver(s)`);
      }
    } catch (error) {
      ScrambleLogger.warn(`Resolver scan failed: ${error instanceof Error ? error.message : error}`);
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
      const generator = new PostmanCollectionGenerator(config.baseUrl, config.globalPrefix);
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
          provide: 'NEST_SCRAMBLE_WS',
          useValue: wsDocument,
        },
        {
          provide: 'NEST_SCRAMBLE_GRAPHQL',
          useValue: graphqlDocument,
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
      // Only register the docs controller when the user has not disabled it.
      // In production the docs UI is disabled by default unless explicitly
      // opted in via enableDocs: true.
      controllers: config.enableDocs !== false ? [createDocsController({ path: config.path })] : [],
    };
  }

  configure(consumer: MiddlewareConsumer) {
    if (NestScrambleModule.moduleOptions.enableDriftDetection) {
      consumer
        .apply(DriftMiddleware)
        .forRoutes({ path: buildWildcardRoute(''), method: RequestMethod.ALL });
    }

    if (NestScrambleModule.moduleOptions.enableMock === false) {
      return;
    }

    // The route pattern differs between Express 4 (NestJS 10) and Express 5
    // (NestJS 11), where anonymous `*` wildcards are rejected outright.
    //
    // When the host app uses app.setGlobalPrefix(), root-level middleware paths
    // are no longer reachable, so the mock is also mounted under that prefix.
    const mountPaths = [MOCK_ROUTE_PREFIX];
    if (NestScrambleModule.moduleOptions.globalPrefix) {
      mountPaths.unshift(
        `${NestScrambleModule.moduleOptions.globalPrefix.replace(/^\/+|\/+$/g, '')}/${MOCK_ROUTE_PREFIX}`,
      );
    }

    consumer
      .apply(MockMiddleware)
      .forRoutes(
        ...mountPaths.map(path => ({ path: buildWildcardRoute(path), method: RequestMethod.ALL })),
      );
  }
}