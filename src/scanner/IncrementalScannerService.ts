/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import { ClassDeclaration, Decorator, MethodDeclaration, Node, Project, SourceFile } from 'ts-morph';
import { AnalyzedType, DtoAnalyzer } from '../utils/DtoAnalyzer';
import { CacheManager, CachedController } from '../cache/CacheManager';
import { DependencyTracker } from '../tracker/DependencyTracker';
import { FileChangeEvent } from '../watcher/FileWatcher';
import * as path from 'path';
import * as fs from 'fs';

export interface ControllerInfo {
  name: string;
  path: string;
  methods: MethodInfo[];
  hasGuards?: boolean;
  filePath?: string;
}

export interface MethodInfo {
  name: string;
  httpMethod: string;
  route: string;
  parameters: ParameterInfo[];
  returnType: AnalyzedType;
  hasGuards?: boolean;
}

export interface ParameterInfo {
  name: string;
  type: AnalyzedType;
  decorator?: string;
  parameterLocation?: 'path' | 'query' | 'header' | 'body';
}

export interface ScanOptions {
  useCache?: boolean;
  cacheFilePath?: string;
  skipDependencyTracking?: boolean;
  hashAlgorithm?: 'md5' | 'sha256';
  cacheTtl?: number;
}

export class IncrementalScannerService {
  private project: Project | null = null;
  private dtoAnalyzer = new DtoAnalyzer();
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
      console.log('[IncrementalScanner] Already initialized');
      return;
    }

    const hostProjectRoot = process.cwd();
    this.sourcePath = `${hostProjectRoot}/${sourcePath}`;
    this.tsconfigPath = `${hostProjectRoot}/tsconfig.json`;

    console.log(`[IncrementalScanner] Initializing scanner...`);
    console.log(`[IncrementalScanner] Source: ${this.sourcePath}`);
    console.log(`[IncrementalScanner] Config: ${this.tsconfigPath}`);

    this.initializeProject();
    this.loadCache();
    this.isInitialized = true;
  }

  /**
   * Initialize ts-morph project
   */
  private initializeProject(): void {
    try {
      if (!fs.existsSync(this.tsconfigPath)) {
        console.warn(`[IncrementalScanner] tsconfig.json not found, creating project without config`);
        this.project = new Project({
          skipAddingFilesFromTsConfig: true,
        });
      } else {
        this.project = new Project({
          tsConfigFilePath: this.tsconfigPath,
          skipAddingFilesFromTsConfig: true,
        });
      }

      this.dependencyTracker = new DependencyTracker(this.project);
    } catch (error) {
      console.error(`[IncrementalScanner] Error initializing project:`, error);
      this.project = new Project({
        skipAddingFilesFromTsConfig: true,
      });
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
        console.log('[IncrementalScanner] tsconfig.json changed, invalidating cache');
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
      console.error(`[IncrementalScanner] Project not initialized`);
      return [];
    }

    console.log(`[IncrementalScanner] Starting full scan...`);

    try {
      const pattern = `${this.sourcePath}/**/*.ts`;
      this.project.addSourceFilesAtPaths(pattern);
    } catch (error) {
      console.error(`[IncrementalScanner] Error adding source files:`, error);
      return [];
    }

    const sourceFiles = this.project.getSourceFiles();
    console.log(`[IncrementalScanner] Loaded ${sourceFiles.length} file(s)`);

    const controllers: ControllerInfo[] = [];
    const controllerPaths: string[] = [];

    for (const sourceFile of sourceFiles) {
      const filePath = sourceFile.getFilePath();
      const controllerInfo = this.scanFile(filePath);
      
      if (controllerInfo) {
        controllers.push(controllerInfo);
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

    console.log(`[IncrementalScanner] Scan complete: ${controllers.length} controller(s)`);
    return controllers;
  }

  /**
   * Scan a single file and update cache
   */
  scanFile(filePath: string): ControllerInfo | null {
    if (!this.project) {
      return null;
    }

    const normalizedPath = path.normalize(filePath);
    const fileHash = this.cacheManager.calculateHash(normalizedPath);
    const fileSize = CacheManager.getFileSize(normalizedPath);

    const cached = this.cacheManager.getController(normalizedPath);
    if (cached && !this.cacheManager.hasFileChanged(normalizedPath, fileHash)) {
      console.log(`[IncrementalScanner] Using cached data for: ${normalizedPath}`);
      return cached.controllerInfo;
    }

    let sourceFile = this.project.getSourceFile(normalizedPath);
    
    if (!sourceFile) {
      try {
        sourceFile = this.project.addSourceFileAtPath(normalizedPath);
      } catch (error) {
        console.error(`[IncrementalScanner] Error adding file ${normalizedPath}:`, error);
        return null;
      }
    } else {
      sourceFile.refreshFromFileSystemSync();
    }

    const controllerClasses = sourceFile.getClasses().filter(cls => this.hasControllerDecorator(cls));

    if (controllerClasses.length === 0) {
      this.cacheManager.removeController(normalizedPath);
      return null;
    }

    const controllerClass = controllerClasses[0];
    const controllerInfo = this.extractControllerInfo(controllerClass);

    if (controllerInfo) {
      controllerInfo.filePath = normalizedPath;

      const dependencies = this.dependencyTracker?.analyzeDependencies(normalizedPath) || [];

      const cachedController: CachedController = {
        filePath: normalizedPath,
        fileHash,
        fileSize,
        controllerInfo,
        dependencies,
        lastScanned: Date.now(),
      };

      this.cacheManager.setController(normalizedPath, cachedController);

      for (const dep of dependencies) {
        this.cacheManager.addDependency(normalizedPath, dep);
      }

      console.log(`[IncrementalScanner] Scanned: ${controllerInfo.name} (${controllerInfo.methods.length} endpoints)`);
    }

    return controllerInfo;
  }

  /**
   * Process file changes incrementally
   */
  processFileChanges(events: FileChangeEvent[]): Map<string, ControllerInfo | null> {
    if (!this.isInitialized || !this.project) {
      console.error('[IncrementalScanner] Scanner not initialized');
      return new Map();
    }

    console.log(`[IncrementalScanner] Processing ${events.length} file change(s)`);

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

    console.log(`[IncrementalScanner] Updated ${results.size} file(s)`);
    return results;
  }

  /**
   * Handle file deletion
   */
  private handleFileDelete(filePath: string, affectedFiles: Set<string>): void {
    console.log(`[IncrementalScanner] File deleted: ${filePath}`);

    const dependents = this.cacheManager.getDependentControllers(filePath);
    dependents.forEach(dep => affectedFiles.add(dep));

    this.cacheManager.removeController(filePath);

    if (this.dependencyTracker) {
      this.dependencyTracker.removeDependency(filePath);
    }

    const sourceFile = this.project?.getSourceFile(filePath);
    if (sourceFile) {
      this.project?.removeSourceFile(sourceFile);
    }
  }

  /**
   * Get all controllers from cache and current scan
   */
  getAllControllers(): ControllerInfo[] {
    const controllers: ControllerInfo[] = [];
    
    for (const [_, cached] of this.cacheManager.getAllControllers()) {
      controllers.push(cached.controllerInfo);
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
  getProject(): Project | null {
    return this.project;
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    console.log('[IncrementalScanner] Cleaning up resources...');
    
    this.cacheManager.save();
    
    if (this.project) {
      const sourceFiles = this.project.getSourceFiles();
      for (const sourceFile of sourceFiles) {
        this.project.removeSourceFile(sourceFile);
      }
    }
    
    this.isInitialized = false;
  }

  private hasControllerDecorator(cls: ClassDeclaration): boolean {
    return cls.getDecorators().some(decorator => {
      const callExpression = decorator.getCallExpression();
      if (!callExpression) return false;
      const expression = callExpression.getExpression();
      return Node.isIdentifier(expression) && expression.getText() === 'Controller';
    });
  }

  private extractControllerInfo(cls: ClassDeclaration): ControllerInfo | null {
    const controllerDecorator = cls.getDecorators().find(decorator => {
      const callExpression = decorator.getCallExpression();
      if (!callExpression) return false;
      const expression = callExpression.getExpression();
      return Node.isIdentifier(expression) && expression.getText() === 'Controller';
    });

    if (!controllerDecorator) return null;

    const controllerPath = this.extractDecoratorArgument(controllerDecorator) || '';

    const hasGuards = cls.getDecorators().some(decorator => {
      const callExpression = decorator.getCallExpression();
      if (!callExpression) return false;
      const expression = callExpression.getExpression();
      return Node.isIdentifier(expression) && expression.getText() === 'UseGuards';
    });

    const methods: MethodInfo[] = [];

    for (const method of cls.getMethods()) {
      const methodInfo = this.extractMethodInfo(method);
      if (methodInfo) {
        methods.push(methodInfo);
      }
    }

    return {
      name: cls.getName() || 'UnknownController',
      path: controllerPath,
      methods,
      hasGuards,
    };
  }

  private extractDecoratorArgument(decorator: Decorator): string | undefined {
    const callExpression = decorator.getCallExpression();
    if (!callExpression) return undefined;
    const args = callExpression.getArguments();
    if (args.length === 0) return '';
    const firstArg = args[0];
    if (Node.isStringLiteral(firstArg)) {
      return firstArg.getLiteralValue();
    }
    return undefined;
  }

  private extractMethodInfo(method: MethodDeclaration): MethodInfo | null {
    const httpDecorator = method.getDecorators().find(decorator => {
      const callExpression = decorator.getCallExpression();
      if (!callExpression) return false;
      const expression = callExpression.getExpression();
      if (!Node.isIdentifier(expression)) return false;
      const decoratorName = expression.getText();
      return ['Get', 'Post', 'Put', 'Delete', 'Patch'].includes(decoratorName);
    });

    if (!httpDecorator) return null;

    const callExpression = httpDecorator.getCallExpression()!;
    const expression = callExpression.getExpression() as any;
    const httpMethod = expression.getText().toUpperCase();
    const route = this.extractDecoratorArgument(httpDecorator) || '';

    const hasGuards = method.getDecorators().some(decorator => {
      const callExpression = decorator.getCallExpression();
      if (!callExpression) return false;
      const expression = callExpression.getExpression();
      return Node.isIdentifier(expression) && expression.getText() === 'UseGuards';
    });

    const parameters: ParameterInfo[] = method.getParameters().map(param => {
      const decoratorText = param.getDecorators().map(d => d.getText()).join(' ');
      let parameterLocation: 'path' | 'query' | 'header' | 'body' | undefined;

      if (decoratorText.includes('@Body')) {
        parameterLocation = 'body';
      } else if (decoratorText.includes('@Param')) {
        parameterLocation = 'path';
      } else if (decoratorText.includes('@Query')) {
        parameterLocation = 'query';
      } else if (decoratorText.includes('@Headers')) {
        parameterLocation = 'header';
      }

      return {
        name: param.getName(),
        type: this.dtoAnalyzer.analyzeType(param.getType()),
        decorator: decoratorText,
        parameterLocation,
      };
    });

    const returnType = this.dtoAnalyzer.analyzeType(method.getReturnType());

    return {
      name: method.getName(),
      httpMethod,
      route,
      parameters,
      returnType,
      hasGuards,
    };
  }
}
