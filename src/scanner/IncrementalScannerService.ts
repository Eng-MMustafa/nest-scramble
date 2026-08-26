/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import * as ts from 'typescript';
import { TsProject } from '../analysis/TsProject';
import { CacheManager } from '../cache/CacheManager';
import { DependencyTracker } from '../tracker/DependencyTracker';
import { FileChangeEvent } from '../watcher/FileWatcher';
import {
  ControllerInfo as ScannedControllerInfo,
  MethodInfo,
  ParameterInfo,
  resolveSourcePath,
  ScannerService,
} from './ScannerService';
import { ScrambleLogger } from '../utils/ScrambleLogger';
import * as path from 'path';
import * as fs from 'fs';

/**
 * The incremental scanner records which file a controller came from so the cache
 * can be invalidated per file. Everything else is the canonical shape.
 */
export interface ControllerInfo extends ScannedControllerInfo {
  filePath?: string;
}

export type { MethodInfo, ParameterInfo };

export interface ScanOptions {
  useCache?: boolean;
  cacheFilePath?: string;
  skipDependencyTracking?: boolean;
  hashAlgorithm?: 'md5' | 'sha256';
  cacheTtl?: number;
}

export class IncrementalScannerService {
  private project: TsProject | null = null;
  /**
   * Extraction is delegated so the incremental path and the normal path can
   * never disagree about what a controller looks like.
   */
  private scanner = new ScannerService();
  private cacheManager: CacheManager;
  private dependencyTracker: DependencyTracker | null = null;
  private sourcePath: string = '';
  private tsconfigPath: string = '';
  private isInitialized = false;

  constructor(options: ScanOptions = {}) {
    this.cacheManager = new CacheManager({
      enabled: options.useCache !== false,
      cacheFilePath: options.cacheFilePath,
      hashAlgorithm: options.hashAlgorithm || 'md5',
      ttl: options.cacheTtl,
    });
  }

  /**
   * Initialize the scanner with project configuration
   */
  initialize(sourcePath: string): void {
    if (this.isInitialized) {
      ScrambleLogger.info('[IncrementalScanner] Already initialized');
      return;
    }

    const hostProjectRoot = process.cwd();
    this.sourcePath = resolveSourcePath(sourcePath, hostProjectRoot);
    this.tsconfigPath = path.join(hostProjectRoot, 'tsconfig.json');

    ScrambleLogger.info(`[IncrementalScanner] Initializing scanner...`);
    ScrambleLogger.info(`[IncrementalScanner] Source: ${this.sourcePath}`);
    ScrambleLogger.info(`[IncrementalScanner] Config: ${this.tsconfigPath}`);

    this.initializeProject();
    this.loadCache();
    this.isInitialized = true;
  }

  /**
   * Initialize the TypeScript project
   */
  private initializeProject(): void {
    try {
      if (!fs.existsSync(this.tsconfigPath)) {
        ScrambleLogger.warn(`[IncrementalScanner] tsconfig.json not found, creating project without config`);
        this.project = new TsProject();
      } else {
        this.project = new TsProject(this.tsconfigPath);
      }

      this.dependencyTracker = new DependencyTracker(this.project);
    } catch (error) {
      ScrambleLogger.error(`[IncrementalScanner] Error initializing project:`, error);
      this.project = new TsProject();
      this.dependencyTracker = new DependencyTracker(this.project);
    }
  }

  /**
   * Load cache and check for invalidation
   */
  private loadCache(): void {
    const loaded = this.cacheManager.load();
    
    if (!loaded) {
      return;
    }

    if (fs.existsSync(this.tsconfigPath)) {
      const currentTsConfigHash = this.cacheManager.calculateTsConfigHash(this.tsconfigPath);
      
      if (this.cacheManager.hasTsConfigChanged(currentTsConfigHash)) {
        ScrambleLogger.info('[IncrementalScanner] tsconfig.json changed, invalidating cache');
        this.cacheManager.invalidate();
        return;
      }
    }

    this.cacheManager.cleanup();
  }

  /**
   * Full scan of all controllers
   */
  scanControllers(sourcePath: string): ControllerInfo[] {
    if (!this.isInitialized) {
      this.initialize(sourcePath);
    }

    if (!this.project) {
      ScrambleLogger.error(`[IncrementalScanner] Project not initialized`);
      return [];
    }

    ScrambleLogger.info(`[IncrementalScanner] Starting full scan...`);

    try {
      this.project.addSourceFilesInDirectory(this.sourcePath);
    } catch (error) {
      ScrambleLogger.error(`[IncrementalScanner] Error adding source files:`, error);
      return [];
    }

    const sourceFiles = this.project.getSourceFiles();
    ScrambleLogger.info(`[IncrementalScanner] Loaded ${sourceFiles.length} file(s)`);

    const controllers: ControllerInfo[] = [];
    const controllerPaths: string[] = [];

    for (const sourceFile of sourceFiles) {
      const filePath = sourceFile.fileName;
      const found = this.scanFileAll(filePath);

      if (found.length > 0) {
        controllers.push(...found);
        controllerPaths.push(filePath);
      }
    }

    if (this.dependencyTracker) {
      this.dependencyTracker.buildGraph(controllerPaths);
    }

    if (fs.existsSync(this.tsconfigPath)) {
      const tsConfigHash = this.cacheManager.calculateTsConfigHash(this.tsconfigPath);
      this.cacheManager.setTsConfigHash(tsConfigHash);
    }

    this.cacheManager.save();

    ScrambleLogger.info(`[IncrementalScanner] Scan complete: ${controllers.length} controller(s)`);
    return controllers;
  }

  /**
   * Scans a single file and updates the cache.
   *
   * @deprecated Returns only the first controller in the file. Use
   * {@link scanFileAll}, which reports every `@Controller()` class.
   */
  scanFile(filePath: string): ControllerInfo | null {
    return this.scanFileAll(filePath)[0] ?? null;
  }

  /**
   * Scans a single file and updates the cache, returning every controller it
   * declares.
   *
   * A file may legitimately declare several `@Controller()` classes; the previous
   * implementation kept only `controllerClasses[0]`, so the rest never reached
   * the generated document when incremental scanning was enabled.
   */
  scanFileAll(filePath: string): ControllerInfo[] {
    if (!this.project) {
      return [];
    }

    const normalizedPath = path.normalize(filePath);
    const fileHash = this.cacheManager.calculateHash(normalizedPath);
    const fileSize = CacheManager.getFileSize(normalizedPath);

    const cached = this.cacheManager.getController(normalizedPath);
    if (cached && !this.cacheManager.hasFileChanged(normalizedPath, fileHash)) {
      ScrambleLogger.info(`[IncrementalScanner] Using cached data for: ${normalizedPath}`);
      return cached.controllerInfos;
    }

    let sourceFile = this.project.getSourceFile(normalizedPath);

    if (!sourceFile) {
      try {
        sourceFile = this.project.addSourceFileAtPath(normalizedPath);
      } catch (error) {
        ScrambleLogger.error(`[IncrementalScanner] Error adding file ${normalizedPath}:`, error);
        return [];
      }
    } else {
      // A rebuild of the underlying program re-reads changed files from disk.
      this.project.refresh();
      sourceFile = this.project.getSourceFile(normalizedPath);
      if (!sourceFile) {
        return [];
      }
    }

    // The extractor resolves DTO types through the current program's checker.
    this.scanner.useChecker(this.project.getChecker());

    const controllerClasses = sourceFile.statements
      .filter(ts.isClassDeclaration)
      .filter(cls => this.scanner.hasControllerDecorator(cls));

    if (controllerClasses.length === 0) {
      this.cacheManager.removeController(normalizedPath);
      return [];
    }

    const controllerInfos: ControllerInfo[] = [];

    for (const controllerClass of controllerClasses) {
      const controllerInfo: ControllerInfo | null = this.scanner.extractControllerInfo(controllerClass);
      if (!controllerInfo) continue;

      controllerInfo.filePath = normalizedPath;
      controllerInfos.push(controllerInfo);
    }

    if (controllerInfos.length === 0) {
      this.cacheManager.removeController(normalizedPath);
      return [];
    }

    const dependencies = this.dependencyTracker?.analyzeDependencies(normalizedPath) || [];

    this.cacheManager.setController(normalizedPath, {
      filePath: normalizedPath,
      fileHash,
      fileSize,
      controllerInfos,
      dependencies,
      lastScanned: Date.now(),
    });

    for (const dep of dependencies) {
      this.cacheManager.addDependency(normalizedPath, dep);
    }

    for (const info of controllerInfos) {
      ScrambleLogger.info(`[IncrementalScanner] Scanned: ${info.name} (${info.methods.length} endpoints)`);
    }

    return controllerInfos;
  }

  /**
   * Process file changes incrementally
   */
  processFileChanges(events: FileChangeEvent[]): Map<string, ControllerInfo | null> {
    if (!this.isInitialized || !this.project) {
      ScrambleLogger.error('[IncrementalScanner] Scanner not initialized');
      return new Map();
    }

    ScrambleLogger.info(`[IncrementalScanner] Processing ${events.length} file change(s)`);

    const affectedFiles = new Set<string>();
    const results = new Map<string, ControllerInfo | null>();

    for (const event of events) {
      const normalizedPath = path.normalize(event.filePath);

      if (event.type === 'unlink') {
        this.handleFileDelete(normalizedPath, affectedFiles);
      } else {
        affectedFiles.add(normalizedPath);

        if (this.dependencyTracker?.isDtoFile(normalizedPath)) {
          const dependents = this.dependencyTracker.getDependents(normalizedPath);
          dependents.forEach(dep => affectedFiles.add(dep));
        }
      }
    }

    for (const filePath of affectedFiles) {
      if (!fs.existsSync(filePath)) {
        continue;
      }

      const controllerInfo = this.scanFile(filePath);
      results.set(filePath, controllerInfo);

      if (this.dependencyTracker && controllerInfo) {
        this.dependencyTracker.updateDependency(filePath);
      }
    }

    this.cacheManager.save();

    ScrambleLogger.info(`[IncrementalScanner] Updated ${results.size} file(s)`);
    return results;
  }

  /**
   * Handle file deletion
   */
  private handleFileDelete(filePath: string, affectedFiles: Set<string>): void {
    ScrambleLogger.info(`[IncrementalScanner] File deleted: ${filePath}`);

    const dependents = this.cacheManager.getDependentControllers(filePath);
    dependents.forEach(dep => affectedFiles.add(dep));

    this.cacheManager.removeController(filePath);

    if (this.dependencyTracker) {
      this.dependencyTracker.removeDependency(filePath);
    }

    this.project?.removeSourceFile(filePath);
  }

  /**
   * Get all controllers from cache and current scan
   */
  getAllControllers(): ControllerInfo[] {
    const controllers: ControllerInfo[] = [];
    
    for (const [_, cached] of this.cacheManager.getAllControllers()) {
      controllers.push(...cached.controllerInfos);
    }

    return controllers;
  }

  /**
   * Get cache manager instance
   */
  getCacheManager(): CacheManager {
    return this.cacheManager;
  }

  /**
   * Get dependency tracker instance
   */
  getDependencyTracker(): DependencyTracker | null {
    return this.dependencyTracker;
  }

  /**
   * Get project instance
   */
  getProject(): TsProject | null {
    return this.project;
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    ScrambleLogger.info('[IncrementalScanner] Cleaning up resources...');

    this.cacheManager.save();

    if (this.project) {
      for (const sourceFile of this.project.getSourceFiles()) {
        this.project.removeSourceFile(sourceFile.fileName);
      }
    }

    this.isInitialized = false;
  }

}
