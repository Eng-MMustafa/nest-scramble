/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
/**
 * Example: Using Watch Mode with Incremental Scanning
 * 
 * This example demonstrates how to use the file watcher with caching
 * for automatic API documentation regeneration during development.
 */

import { WatchModeService } from '../watcher/WatchModeService';

async function main() {
  const watchMode = new WatchModeService({
    sourcePath: 'src',
    outputPath: 'openapi.json',
    baseUrl: 'http://localhost:3000',
    title: 'My NestJS API',
    apiVersion: '1.0.0',
    useCache: true,
    onRegenerate: async (spec) => {
      console.log('📦 OpenAPI spec regenerated!');
      // You can add custom logic here, e.g., notify a UI, upload to a server, etc.
    },
  });

  // Start watch mode
  await watchMode.start();

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    await watchMode.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await watchMode.stop();
    process.exit(0);
  });
}

main().catch(console.error);
