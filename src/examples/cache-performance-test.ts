/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
/**
 * Cache Performance Test
 * 
 * This script demonstrates the performance benefits of caching
 * by comparing cold vs warm cache performance.
 */

import { IncrementalScannerService } from '../scanner/IncrementalScannerService';
import { ScannerService } from '../scanner/ScannerService';
import * as fs from 'fs';

async function runPerformanceTest() {
  console.log('\n' + '='.repeat(70));
  console.log('🧪 Nest-Scramble Cache Performance Test');
  console.log('='.repeat(70) + '\n');

  const sourcePath = 'src';

  // Test 1: Traditional ScannerService (no cache)
  console.log('📊 Test 1: Traditional Scanner (No Cache)');
  console.log('-'.repeat(70));
  
  const traditionalScanner = new ScannerService();
  
  const t1Start = Date.now();
  const t1Controllers = traditionalScanner.scanControllers(sourcePath);
  const t1Duration = Date.now() - t1Start;
  
  console.log(`✅ Scan completed in ${t1Duration}ms`);
  console.log(`   Controllers: ${t1Controllers.length}`);
  console.log(`   Endpoints: ${t1Controllers.reduce((sum, c) => sum + c.methods.length, 0)}\n`);

  // Test 2: IncrementalScanner - Cold cache (first run)
  console.log('📊 Test 2: Incremental Scanner - Cold Cache (First Run)');
  console.log('-'.repeat(70));
  
  // Delete cache file if exists
  const cacheFile = 'test-cache.json';
  if (fs.existsSync(cacheFile)) {
    fs.unlinkSync(cacheFile);
  }
  
  const coldScanner = new IncrementalScannerService({
    useCache: true,
    cacheFilePath: cacheFile,
  });
  
  coldScanner.initialize(sourcePath);
  
  const t2Start = Date.now();
  const t2Controllers = coldScanner.scanControllers(sourcePath);
  const t2Duration = Date.now() - t2Start;
  
  console.log(`✅ Scan completed in ${t2Duration}ms`);
  console.log(`   Controllers: ${t2Controllers.length}`);
  console.log(`   Endpoints: ${t2Controllers.reduce((sum, c) => sum + c.methods.length, 0)}`);
  
  const t2Stats = coldScanner.getCacheManager().getStats();
  console.log(`   Cache saved: ${(t2Stats.cacheSize / 1024).toFixed(2)} KB\n`);
  
  coldScanner.cleanup();

  // Test 3: IncrementalScanner - Warm cache (second run)
  console.log('📊 Test 3: Incremental Scanner - Warm Cache (Second Run)');
  console.log('-'.repeat(70));
  
  const warmScanner = new IncrementalScannerService({
    useCache: true,
    cacheFilePath: cacheFile,
  });
  
  warmScanner.initialize(sourcePath);
  
  const t3Start = Date.now();
  const t3Controllers = warmScanner.scanControllers(sourcePath);
  const t3Duration = Date.now() - t3Start;
  
  console.log(`✅ Scan completed in ${t3Duration}ms`);
  console.log(`   Controllers: ${t3Controllers.length}`);
  console.log(`   Endpoints: ${t3Controllers.reduce((sum, c) => sum + c.methods.length, 0)}`);
  
  const t3Stats = warmScanner.getCacheManager().getStats();
  console.log(`   Cache loaded: ${(t3Stats.cacheSize / 1024).toFixed(2)} KB`);
  console.log(`   Cache age: ${(t3Stats.cacheAge / 1000).toFixed(1)}s\n`);
  
  warmScanner.cleanup();

  // Test 4: Incremental update (single file change)
  console.log('📊 Test 4: Incremental Update (Single File Change)');
  console.log('-'.repeat(70));
  
  const incrementalScanner = new IncrementalScannerService({
    useCache: true,
    cacheFilePath: cacheFile,
  });
  
  incrementalScanner.initialize(sourcePath);
  incrementalScanner.scanControllers(sourcePath);
  
  // Simulate a file change
  const controllers = incrementalScanner.getAllControllers();
  if (controllers.length > 0) {
    const firstController = controllers[0];
    const filePath = firstController.filePath || '';
    
    if (filePath && fs.existsSync(filePath)) {
      const t4Start = Date.now();
      const result = incrementalScanner.scanFile(filePath);
      const t4Duration = Date.now() - t4Start;
      
      console.log(`✅ Incremental scan completed in ${t4Duration}ms`);
      console.log(`   File: ${filePath.split('/').pop()}`);
      console.log(`   Controller: ${result?.name || 'N/A'}`);
      console.log(`   Endpoints: ${result?.methods.length || 0}\n`);
    }
  }
  
  incrementalScanner.cleanup();

  // Performance Summary
  console.log('='.repeat(70));
  console.log('📈 Performance Summary');
  console.log('='.repeat(70));
  console.log(`Traditional Scanner:        ${t1Duration}ms (baseline)`);
  console.log(`Incremental (cold cache):   ${t2Duration}ms (${((t2Duration / t1Duration) * 100).toFixed(1)}% of baseline)`);
  console.log(`Incremental (warm cache):   ${t3Duration}ms (${((t3Duration / t1Duration) * 100).toFixed(1)}% of baseline)`);
  console.log(`\n🚀 Speedup with warm cache: ${(t1Duration / t3Duration).toFixed(1)}x faster`);
  console.log('='.repeat(70) + '\n');

  // Cleanup
  if (fs.existsSync(cacheFile)) {
    fs.unlinkSync(cacheFile);
    console.log('🧹 Test cache file cleaned up\n');
  }
}

// Run test
if (require.main === module) {
  runPerformanceTest().catch(console.error);
}

export { runPerformanceTest };
