/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
/**
 * Example: Using Incremental Scanner with Manual File Changes
 * 
 * This example shows how to use the IncrementalScannerService
 * to process specific file changes without the file watcher.
 */

import { IncrementalScannerService } from '../scanner/IncrementalScannerService';
import { FileChangeEvent } from '../watcher/FileWatcher';

async function main() {
  // Initialize the scanner with caching enabled
  const scanner = new IncrementalScannerService({
    useCache: true,
    cacheFilePath: 'scramble-cache.json',
  });

  // Initialize and perform full scan
  scanner.initialize('src');
  const controllers = scanner.scanControllers('src');

  console.log(`Initial scan: ${controllers.length} controllers found`);

  // Simulate file changes
  const fileChanges: FileChangeEvent[] = [
    {
      type: 'change',
      filePath: 'k:/libe/nest-scramble/src/controllers/users.controller.ts',
      hash: 'abc123',
    },
    {
      type: 'change',
      filePath: 'k:/libe/nest-scramble/src/dto/create-user.dto.ts',
      hash: 'def456',
    },
  ];

  // Process incremental changes
  const results = scanner.processFileChanges(fileChanges);

  console.log(`\nProcessed ${results.size} file(s):`);
  for (const [filePath, controllerInfo] of results.entries()) {
    if (controllerInfo) {
      console.log(`  ✅ ${controllerInfo.name} - ${controllerInfo.methods.length} endpoints`);
    } else {
      console.log(`  ℹ️  ${filePath} - not a controller`);
    }
  }

  // Get updated controllers
  const updatedControllers = scanner.getAllControllers();
  console.log(`\nTotal controllers: ${updatedControllers.length}`);

  // Get cache statistics
  const stats = scanner.getCacheManager().getStats();
  console.log(`\nCache Statistics:`);
  console.log(`  Controllers: ${stats.controllerCount}`);
  console.log(`  Dependencies: ${stats.dependencyCount}`);
  console.log(`  Cache size: ${(stats.cacheSize / 1024).toFixed(2)} KB`);
  console.log(`  Cache age: ${(stats.cacheAge / 1000).toFixed(0)} seconds`);

  // Cleanup
  scanner.cleanup();
}

main().catch(console.error);
