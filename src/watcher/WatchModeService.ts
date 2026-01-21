/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import { IncrementalScannerService } from '../scanner/IncrementalScannerService';
import { FileWatcher, FileChangeEvent } from './FileWatcher';
import { CacheManager } from '../cache/CacheManager';
import { OpenApiTransformer } from '../utils/OpenApiTransformer';
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
      console.log('[WatchMode] Already running');
      return;
    }

    console.log('\n' + '='.repeat(60));
    console.log('🔍 Nest-Scramble Watch Mode');
    console.log('   Developed by Mohamed Mustafa | MIT License');
    console.log('='.repeat(60) + '\n');

    this.scanner.initialize(this.options.sourcePath);

    console.log('[WatchMode] Performing initial scan...');
    const controllers = this.scanner.scanControllers(this.options.sourcePath);
    
    if (controllers.length === 0) {
      console.log('⚠️  No controllers found. Waiting for changes...');
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

    console.log('\n✅ Watch mode active. Press Ctrl+C to stop.\n');
  }

  /**
   * Stop watch mode
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('\n[WatchMode] Stopping watch mode...');

    if (this.watcher) {
      await this.watcher.stop();
      this.watcher = null;
    }

    this.scanner.cleanup();
    this.isRunning = false;

    console.log('[WatchMode] Stopped.\n');
  }

  /**
   * Handle file changes
   */
  private async handleFileChanges(events: FileChangeEvent[]): Promise<void> {
    console.log('\n' + '-'.repeat(60));
    console.log(`🔄 Detected ${events.length} file change(s)`);
    console.log('-'.repeat(60));

    for (const event of events) {
      const fileName = path.basename(event.filePath);
      const eventType = event.type === 'add' ? '➕ Added' : 
                       event.type === 'change' ? '✏️  Changed' : 
                       '❌ Deleted';
      console.log(`${eventType}: ${fileName}`);
    }

    const results = this.scanner.processFileChanges(events);

    const controllers = this.scanner.getAllControllers();
    
    if (controllers.length === 0) {
      console.log('\n⚠️  No controllers found after update.');
      return;
    }

    await this.generateOutput(controllers);

    const stats = this.scanner.getCacheManager().getStats();
    console.log(`\n📊 Cache: ${stats.controllerCount} controllers, ${(stats.cacheSize / 1024).toFixed(2)} KB`);
    console.log('-'.repeat(60) + '\n');
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
      console.log(`\n✅ Generated: ${controllers.length} controllers, ${methodCount} endpoints`);
      console.log(`📄 Output: ${outputPath}`);

      if (this.options.onRegenerate) {
        await this.options.onRegenerate(spec);
      }
    } catch (error) {
      console.error('\n❌ Error generating output:', error);
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
    console.log('[WatchMode] Invalidating cache...');
    this.scanner.getCacheManager().invalidate();
    console.log('[WatchMode] Cache invalidated. Performing full rescan...');
    
    const controllers = this.scanner.scanControllers(this.options.sourcePath);
    this.generateOutput(controllers);
  }
}
