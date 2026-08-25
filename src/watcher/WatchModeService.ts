/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import { IncrementalScannerService } from '../scanner/IncrementalScannerService';
import { FileWatcher, FileChangeEvent } from './FileWatcher';
import { OpenApiTransformer } from '../utils/OpenApiTransformer';
import { ScrambleLogger } from '../utils/ScrambleLogger';
import * as fs from 'fs';
import * as path from 'path';

export interface WatchModeOptions {
  sourcePath: string;
  outputPath?: string;
  baseUrl?: string;
  title?: string;
  apiVersion?: string;
  useCache?: boolean;
  onRegenerate?: (spec: any) => void | Promise<void>;
}

export class WatchModeService {
  private scanner: IncrementalScannerService;
  private watcher: FileWatcher | null = null;
  private options: WatchModeOptions;
  private isRunning = false;

  constructor(options: WatchModeOptions) {
    this.options = {
      outputPath: options.outputPath || 'openapi.json',
      baseUrl: options.baseUrl || 'http://localhost:3000',
      title: options.title || 'NestJS API',
      apiVersion: options.apiVersion || '1.0.0',
      useCache: options.useCache !== false,
      ...options,
    };

    this.scanner = new IncrementalScannerService({
      useCache: this.options.useCache,
    });
  }

  /**
   * Start watch mode
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      ScrambleLogger.info('[WatchMode] Already running');
      return;
    }

    ScrambleLogger.info('\n' + '='.repeat(60));
    ScrambleLogger.info('🔍 Nest-Scramble Watch Mode');
    ScrambleLogger.info('   Developed by Mohamed Mustafa | MIT License');
    ScrambleLogger.info('='.repeat(60) + '\n');

    this.scanner.initialize(this.options.sourcePath);

    ScrambleLogger.info('[WatchMode] Performing initial scan...');
    const controllers = this.scanner.scanControllers(this.options.sourcePath);
    
    if (controllers.length === 0) {
      ScrambleLogger.info('⚠️  No controllers found. Waiting for changes...');
    } else {
      await this.generateOutput(controllers);
    }

    const cacheManager = this.scanner.getCacheManager();
    
    this.watcher = new FileWatcher({
      sourcePath: this.options.sourcePath,
      cacheManager,
      onFileChange: async (events) => {
        await this.handleFileChanges(events);
      },
    });

    this.watcher.start();
    this.isRunning = true;

    ScrambleLogger.info('\n✅ Watch mode active. Press Ctrl+C to stop.\n');
  }

  /**
   * Stop watch mode
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    ScrambleLogger.info('\n[WatchMode] Stopping watch mode...');

    if (this.watcher) {
      await this.watcher.stop();
      this.watcher = null;
    }

    this.scanner.cleanup();
    this.isRunning = false;

    ScrambleLogger.info('[WatchMode] Stopped.\n');
  }

  /**
   * Handle file changes
   */
  private async handleFileChanges(events: FileChangeEvent[]): Promise<void> {
    ScrambleLogger.info('\n' + '-'.repeat(60));
    ScrambleLogger.info(`🔄 Detected ${events.length} file change(s)`);
    ScrambleLogger.info('-'.repeat(60));

    for (const event of events) {
      const fileName = path.basename(event.filePath);
      const eventType = event.type === 'add' ? '➕ Added' : 
                       event.type === 'change' ? '✏️  Changed' : 
                       '❌ Deleted';
      ScrambleLogger.info(`${eventType}: ${fileName}`);
    }

    // Called for its effect on the cache; the returned summary is not needed here.
    this.scanner.processFileChanges(events);

    const controllers = this.scanner.getAllControllers();
    
    if (controllers.length === 0) {
      ScrambleLogger.info('\n⚠️  No controllers found after update.');
      return;
    }

    await this.generateOutput(controllers);

    const stats = this.scanner.getCacheManager().getStats();
    ScrambleLogger.info(`\n📊 Cache: ${stats.controllerCount} controllers, ${(stats.cacheSize / 1024).toFixed(2)} KB`);
    ScrambleLogger.info('-'.repeat(60) + '\n');
  }

  /**
   * Generate OpenAPI output
   */
  private async generateOutput(controllers: any[]): Promise<void> {
    try {
      const transformer = new OpenApiTransformer(this.options.baseUrl!);
      const spec = transformer.transform(
        controllers,
        this.options.title!,
        this.options.apiVersion!,
        this.options.baseUrl!
      );

      const outputPath = path.resolve(this.options.outputPath!);
      fs.writeFileSync(outputPath, JSON.stringify(spec, null, 2));

      const methodCount = controllers.reduce((sum, c) => sum + c.methods.length, 0);
      ScrambleLogger.info(`\n✅ Generated: ${controllers.length} controllers, ${methodCount} endpoints`);
      ScrambleLogger.info(`📄 Output: ${outputPath}`);

      if (this.options.onRegenerate) {
        await this.options.onRegenerate(spec);
      }
    } catch (error) {
      ScrambleLogger.error('\n❌ Error generating output:', error);
    }
  }

  /**
   * Get running status
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): any {
    return this.scanner.getCacheManager().getStats();
  }

  /**
   * Invalidate cache manually
   */
  invalidateCache(): void {
    ScrambleLogger.info('[WatchMode] Invalidating cache...');
    this.scanner.getCacheManager().invalidate();
    ScrambleLogger.info('[WatchMode] Cache invalidated. Performing full rescan...');
    
    const controllers = this.scanner.scanControllers(this.options.sourcePath);
    this.generateOutput(controllers);
  }
}
