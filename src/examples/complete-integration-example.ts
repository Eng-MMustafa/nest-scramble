/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
/**
 * Complete Integration Example
 * 
 * This example demonstrates the full integration of all caching and
 * incremental scanning components in a production-ready setup.
 */

import { IncrementalScannerService } from '../scanner/IncrementalScannerService';
import { FileWatcher } from '../watcher/FileWatcher';
import { CacheManager } from '../cache/CacheManager';
import { DependencyTracker } from '../tracker/DependencyTracker';
import { OpenApiTransformer } from '../utils/OpenApiTransformer';
import * as fs from 'fs';
import * as path from 'path';

class ProductionDocumentationService {
  private scanner: IncrementalScannerService;
  private watcher: FileWatcher | null = null;
  private isRunning = false;

  constructor(
    private sourcePath: string,
    private outputPath: string,
    private baseUrl: string
  ) {
    this.scanner = new IncrementalScannerService({
      useCache: true,
      cacheFilePath: path.join(process.cwd(), '.scramble-cache.json'),
    });
  }

  /**
   * Initialize and start the service
   */
  async start(): Promise<void> {
    console.log('🚀 Starting Nest-Scramble Documentation Service...\n');

    // Initialize scanner
    this.scanner.initialize(this.sourcePath);

    // Check cache status
    const cacheManager = this.scanner.getCacheManager();
    const stats = cacheManager.getStats();
    
    if (stats.controllerCount > 0) {
      console.log(`📦 Cache loaded: ${stats.controllerCount} controllers`);
      console.log(`   Cache age: ${(stats.cacheAge / 1000 / 60).toFixed(1)} minutes`);
      console.log(`   Cache size: ${(stats.cacheSize / 1024).toFixed(2)} KB\n`);
    }

    // Perform initial scan
    console.log('🔍 Performing initial scan...');
    const startTime = Date.now();
    const controllers = this.scanner.scanControllers(this.sourcePath);
    const scanDuration = Date.now() - startTime;

    console.log(`✅ Scan complete in ${scanDuration}ms`);
    console.log(`   Found ${controllers.length} controllers\n`);

    // Generate initial documentation
    await this.generateDocumentation(controllers);

    // Display dependency information
    this.displayDependencyInfo();

    // Start file watcher
    this.startWatcher();

    this.isRunning = true;
  }

  /**
   * Start file watcher
   */
  private startWatcher(): void {
    const cacheManager = this.scanner.getCacheManager();

    this.watcher = new FileWatcher({
      sourcePath: this.sourcePath,
      cacheManager,
      debounceMs: 300,
      onFileChange: async (events) => {
        await this.handleFileChanges(events);
      },
    });

    this.watcher.start();
    console.log('👀 File watcher started\n');
    console.log('Press Ctrl+C to stop\n');
  }

  /**
   * Handle file changes
   */
  private async handleFileChanges(events: any[]): Promise<void> {
    console.log('\n' + '='.repeat(60));
    console.log(`🔄 Processing ${events.length} file change(s)`);
    console.log('='.repeat(60));

    const startTime = Date.now();

    // Categorize changes
    const added = events.filter(e => e.type === 'add');
    const changed = events.filter(e => e.type === 'change');
    const deleted = events.filter(e => e.type === 'unlink');

    if (added.length > 0) {
      console.log(`\n➕ Added: ${added.length} file(s)`);
      added.forEach(e => console.log(`   - ${path.basename(e.filePath)}`));
    }

    if (changed.length > 0) {
      console.log(`\n✏️  Changed: ${changed.length} file(s)`);
      changed.forEach(e => console.log(`   - ${path.basename(e.filePath)}`));
    }

    if (deleted.length > 0) {
      console.log(`\n❌ Deleted: ${deleted.length} file(s)`);
      deleted.forEach(e => console.log(`   - ${path.basename(e.filePath)}`));
    }

    // Process changes incrementally
    const results = this.scanner.processFileChanges(events);

    // Get updated controllers
    const controllers = this.scanner.getAllControllers();

    // Regenerate documentation
    await this.generateDocumentation(controllers);

    const duration = Date.now() - startTime;
    console.log(`\n⚡ Update completed in ${duration}ms`);

    // Display statistics
    const stats = this.scanner.getCacheManager().getStats();
    console.log(`📊 Cache: ${stats.controllerCount} controllers, ${(stats.cacheSize / 1024).toFixed(2)} KB`);
    console.log('='.repeat(60) + '\n');
  }

  /**
   * Generate OpenAPI documentation
   */
  private async generateDocumentation(controllers: any[]): Promise<void> {
    try {
      const transformer = new OpenApiTransformer(this.baseUrl);
      const spec = transformer.transform(
        controllers,
        'NestJS API',
        '1.0.0',
        this.baseUrl
      );

      const outputPath = path.resolve(this.outputPath);
      fs.writeFileSync(outputPath, JSON.stringify(spec, null, 2));

      const methodCount = controllers.reduce((sum, c) => sum + c.methods.length, 0);
      console.log(`\n📄 Documentation generated:`);
      console.log(`   Controllers: ${controllers.length}`);
      console.log(`   Endpoints: ${methodCount}`);
      console.log(`   Output: ${outputPath}`);
    } catch (error) {
      console.error('\n❌ Error generating documentation:', error);
    }
  }

  /**
   * Display dependency information
   */
  private displayDependencyInfo(): void {
    const tracker = this.scanner.getDependencyTracker();
    if (!tracker) {
      return;
    }

    const graph = tracker.exportGraph();
    const totalDeps = Object.values(graph.dependencies).reduce(
      (sum, deps) => sum + deps.length,
      0
    );

    console.log('🔗 Dependency Analysis:');
    console.log(`   Total dependencies tracked: ${totalDeps}`);
    console.log(`   Controllers with dependencies: ${Object.keys(graph.dependencies).length}`);

    // Find most connected files
    const depCounts = Object.entries(graph.reverseDependencies)
      .map(([file, deps]) => ({ file, count: deps.length }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    if (depCounts.length > 0) {
      console.log('\n   Most referenced files:');
      depCounts.forEach(({ file, count }) => {
        const fileName = path.basename(file);
        console.log(`   - ${fileName} (${count} dependents)`);
      });
    }
    console.log('');
  }

  /**
   * Stop the service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('\n🛑 Stopping documentation service...');

    if (this.watcher) {
      await this.watcher.stop();
      this.watcher = null;
    }

    this.scanner.cleanup();
    this.isRunning = false;

    console.log('✅ Service stopped\n');
  }

  /**
   * Manually invalidate cache
   */
  invalidateCache(): void {
    console.log('\n🗑️  Invalidating cache...');
    this.scanner.getCacheManager().invalidate();
    console.log('✅ Cache invalidated\n');
  }

  /**
   * Get service status
   */
  getStatus(): {
    running: boolean;
    cacheStats: any;
    watcherActive: boolean;
  } {
    return {
      running: this.isRunning,
      cacheStats: this.scanner.getCacheManager().getStats(),
      watcherActive: this.watcher?.isActive() || false,
    };
  }
}

// Main execution
async function main() {
  const service = new ProductionDocumentationService(
    'src',
    'openapi.json',
    'http://localhost:3000'
  );

  // Start service
  await service.start();

  // Handle graceful shutdown
  const shutdown = async () => {
    await service.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Optional: Invalidate cache on demand
  process.on('SIGUSR1', () => {
    service.invalidateCache();
  });

  // Optional: Display status on demand
  process.on('SIGUSR2', () => {
    const status = service.getStatus();
    console.log('\n📊 Service Status:', JSON.stringify(status, null, 2), '\n');
  });
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

export { ProductionDocumentationService };
