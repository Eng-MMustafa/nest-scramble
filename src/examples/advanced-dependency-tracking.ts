/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
/**
 * Advanced Dependency Tracking Example
 * 
 * Demonstrates transitive dependency resolution and inheritance tracking
 */

import { IncrementalScannerService } from '../scanner/IncrementalScannerService';
import { DependencyTracker } from '../tracker/DependencyTracker';

async function demonstrateTransitiveDependencies() {
  console.log('\n' + '='.repeat(70));
  console.log('🔗 Advanced Dependency Tracking Demo');
  console.log('='.repeat(70) + '\n');

  const scanner = new IncrementalScannerService({
    useCache: true,
    cacheFilePath: 'test-deps-cache.json',
  });

  scanner.initialize('src');
  const controllers = scanner.scanControllers('src');

  const tracker = scanner.getDependencyTracker();
  if (!tracker) {
    console.log('❌ Dependency tracker not available');
    return;
  }

  console.log(`✅ Scanned ${controllers.length} controllers\n`);

  // Example 1: Show inheritance chains
  console.log('📋 Example 1: Inheritance Chain Analysis');
  console.log('-'.repeat(70));

  for (const controller of controllers.slice(0, 3)) {
    if (!controller.filePath) continue;

    const info = tracker.getDependencyInfo(controller.filePath);
    
    console.log(`\n📦 ${controller.name}`);
    console.log(`   File: ${controller.filePath.split('/').pop()}`);
    console.log(`   Direct dependencies: ${info.dependencies.length}`);
    
    if (info.inheritanceChain && info.inheritanceChain.length > 0) {
      console.log(`   Inheritance chain: ${info.inheritanceChain.length} parent(s)`);
      info.inheritanceChain.forEach((parent, idx) => {
        console.log(`     ${idx + 1}. ${parent.split('/').pop()}`);
      });
    }
  }

  // Example 2: Transitive dependency impact
  console.log('\n\n📋 Example 2: Transitive Dependency Impact');
  console.log('-'.repeat(70));

  // Find a DTO file
  const graph = tracker.exportGraph();
  const dtoFiles = Object.keys(graph.reverseDependencies).filter(file => 
    tracker.isDtoFile(file)
  );

  if (dtoFiles.length > 0) {
    const dtoFile = dtoFiles[0];
    const affected = tracker.getAffectedFiles(dtoFile);
    
    console.log(`\n🎯 DTO File: ${dtoFile.split('/').pop()}`);
    console.log(`   Direct dependents: ${tracker.getDependents(dtoFile).length}`);
    console.log(`   Total affected files (transitive): ${affected.size}`);
    
    if (affected.size > 0) {
      console.log('\n   Affected files:');
      Array.from(affected).slice(0, 5).forEach((file, idx) => {
        console.log(`     ${idx + 1}. ${file.split('/').pop()}`);
      });
      
      if (affected.size > 5) {
        console.log(`     ... and ${affected.size - 5} more`);
      }
    }
  }

  // Example 3: Scenario - DTO with inheritance changes
  console.log('\n\n📋 Example 3: Inheritance Change Scenario');
  console.log('-'.repeat(70));
  console.log('\nScenario: BaseDto changes → UpdateUserDto extends BaseDto → UsersController uses UpdateUserDto\n');

  // Simulate the chain
  console.log('Impact Analysis:');
  console.log('  1. BaseDto.ts changes');
  console.log('  2. System detects UpdateUserDto inherits from BaseDto');
  console.log('  3. System finds UsersController depends on UpdateUserDto');
  console.log('  4. All three files are marked for re-scanning');
  console.log('\n✅ This ensures NO stale data even with deep inheritance chains!');

  // Example 4: Dependency graph visualization
  console.log('\n\n📋 Example 4: Dependency Graph Statistics');
  console.log('-'.repeat(70));

  const totalDeps = Object.values(graph.dependencies).reduce(
    (sum, deps) => sum + deps.length,
    0
  );

  const avgDeps = totalDeps / Object.keys(graph.dependencies).length;

  console.log(`\n📊 Graph Statistics:`);
  console.log(`   Total files tracked: ${Object.keys(graph.dependencies).length}`);
  console.log(`   Total dependencies: ${totalDeps}`);
  console.log(`   Average deps per file: ${avgDeps.toFixed(1)}`);
  console.log(`   DTO files: ${dtoFiles.length}`);

  // Find most connected files
  const depCounts = Object.entries(graph.reverseDependencies)
    .map(([file, deps]) => ({ file, count: deps.length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  if (depCounts.length > 0) {
    console.log('\n   Most referenced files:');
    depCounts.forEach(({ file, count }, idx) => {
      const fileName = file.split('/').pop();
      const isDto = tracker.isDtoFile(file) ? '(DTO)' : '';
      console.log(`     ${idx + 1}. ${fileName} - ${count} dependents ${isDto}`);
    });
  }

  console.log('\n' + '='.repeat(70));
  console.log('✅ Demo complete!');
  console.log('='.repeat(70) + '\n');

  scanner.cleanup();
}

// Run demo
if (require.main === module) {
  demonstrateTransitiveDependencies().catch(console.error);
}

export { demonstrateTransitiveDependencies };
