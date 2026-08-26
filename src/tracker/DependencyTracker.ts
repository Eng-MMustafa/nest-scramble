/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import * as ts from 'typescript';
import { TsProject } from '../analysis/TsProject';
import { ScrambleLogger } from '../utils/ScrambleLogger';
import * as path from 'path';

export interface DependencyInfo {
  filePath: string;
  dependencies: string[];
  dependents: string[];
  inheritanceChain?: string[];
  transitiveAffected?: string[];
}

export class DependencyTracker {
  private project: TsProject;
  private dependencyGraph: Map<string, Set<string>> = new Map();
  private reverseDependencyGraph: Map<string, Set<string>> = new Map();
  private inheritanceGraph: Map<string, Set<string>> = new Map();

  constructor(project: TsProject) {
    this.project = project;
  }

  /**
   * Analyze dependencies for a specific file
   */
  analyzeDependencies(filePath: string): string[] {
    const sourceFile = this.project.getSourceFile(filePath);
    if (!sourceFile) {
      return [];
    }

    const dependencies = new Set<string>();

    // Extract import declarations
    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement)) continue;
      if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;

      const moduleSpecifier = statement.moduleSpecifier.text;

      // Skip node_modules imports
      if (!moduleSpecifier.startsWith('.') && !moduleSpecifier.startsWith('/')) {
        continue;
      }

      const resolvedPath = this.resolveImportPath(sourceFile, moduleSpecifier);
      if (resolvedPath) {
        dependencies.add(resolvedPath);
      }
    }

    // Also check for type references in decorators (e.g., @Body() dto: CreateUserDto)
    const typeReferences = this.extractTypeReferences(sourceFile);
    for (const typeRef of typeReferences) {
      dependencies.add(typeRef);
    }

    // Extract inheritance dependencies
    const inheritanceDeps = this.extractInheritanceDependencies(sourceFile);
    for (const dep of inheritanceDeps) {
      dependencies.add(dep);
    }

    return Array.from(dependencies);
  }

  /**
   * Extract inheritance dependencies (extends, implements)
   */
  private extractInheritanceDependencies(sourceFile: ts.SourceFile): Set<string> {
    const inheritanceDeps = new Set<string>();
    const normalizedPath = path.normalize(sourceFile.fileName);
    const checker = this.project.getChecker();

    // Track inheritance for this file
    const inheritanceChain = new Set<string>();

    const recordHeritageType = (expression: ts.ExpressionWithTypeArguments): void => {
      const type = checker.getTypeAtLocation(expression);
      const symbol = type.getSymbol() ?? type.aliasSymbol;
      if (!symbol) return;

      for (const decl of symbol.getDeclarations() ?? []) {
        const declFile = decl.getSourceFile().fileName;
        if (!declFile.includes('node_modules')) {
          const normalizedDeclPath = path.normalize(declFile);
          inheritanceDeps.add(normalizedDeclPath);
          inheritanceChain.add(normalizedDeclPath);
        }
      }
    };

    // Classes: extends and implements. Interfaces: extends.
    for (const statement of sourceFile.statements) {
      if (!ts.isClassDeclaration(statement) && !ts.isInterfaceDeclaration(statement)) {
        continue;
      }

      for (const clause of statement.heritageClauses ?? []) {
        for (const heritageType of clause.types) {
          recordHeritageType(heritageType);
        }
      }
    }

    // Store inheritance chain
    if (inheritanceChain.size > 0) {
      this.inheritanceGraph.set(normalizedPath, inheritanceChain);
    }

    return inheritanceDeps;
  }

  /**
   * Extract type references from a source file
   */
  private extractTypeReferences(sourceFile: ts.SourceFile): Set<string> {
    const typeRefs = new Set<string>();
    const checker = this.project.getChecker();

    const visit = (node: ts.Node): void => {
      if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
        const symbol = checker.getSymbolAtLocation(node.typeName);
        if (symbol) {
          for (const decl of symbol.getDeclarations() ?? []) {
            const declPath = decl.getSourceFile().fileName;

            // Only track local files, not node_modules
            if (!declPath.includes('node_modules')) {
              typeRefs.add(path.normalize(declPath));
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    return typeRefs;
  }

  /**
   * Resolve import path to absolute file path
   */
  private resolveImportPath(sourceFile: ts.SourceFile, moduleSpecifier: string): string | null {
    try {
      const sourceDir = path.dirname(sourceFile.fileName);
      const resolvedPath = path.resolve(sourceDir, moduleSpecifier);
      
      // Try different extensions
      const extensions = ['.ts', '.tsx', '/index.ts', '/index.tsx'];
      
      const fs = require('fs');
      
      // Check if path exists as-is
      if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
        return path.normalize(resolvedPath);
      }
      
      // Try with extensions
      for (const ext of extensions) {
        const pathWithExt = resolvedPath + ext;
        if (fs.existsSync(pathWithExt)) {
          return path.normalize(pathWithExt);
        }
      }
      
      // Check if it's a directory with index file
      if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()) {
        const indexPath = path.join(resolvedPath, 'index.ts');
        if (fs.existsSync(indexPath)) {
          return path.normalize(indexPath);
        }
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Build dependency graph for all controllers
   */
  buildGraph(controllerPaths: string[]): void {
    ScrambleLogger.info('[DependencyTracker] Building dependency graph...');
    
    this.dependencyGraph.clear();
    this.reverseDependencyGraph.clear();

    for (const controllerPath of controllerPaths) {
      const dependencies = this.analyzeDependencies(controllerPath);
      
      this.dependencyGraph.set(controllerPath, new Set(dependencies));
      
      // Build reverse graph
      for (const dep of dependencies) {
        if (!this.reverseDependencyGraph.has(dep)) {
          this.reverseDependencyGraph.set(dep, new Set());
        }
        this.reverseDependencyGraph.get(dep)!.add(controllerPath);
      }
    }

    ScrambleLogger.info(`[DependencyTracker] Graph built: ${this.dependencyGraph.size} controllers, ${this.reverseDependencyGraph.size} dependencies`);
  }

  /**
   * Get direct dependencies of a file
   */
  getDependencies(filePath: string): string[] {
    const normalizedPath = path.normalize(filePath);
    const deps = this.dependencyGraph.get(normalizedPath);
    return deps ? Array.from(deps) : [];
  }

  /**
   * Get files that depend on the given file
   */
  getDependents(filePath: string): string[] {
    const normalizedPath = path.normalize(filePath);
    const dependents = this.reverseDependencyGraph.get(normalizedPath);
    return dependents ? Array.from(dependents) : [];
  }

  /**
   * Get all files affected by a change (transitive dependencies)
   * Includes inheritance chain tracking
   */
  getAffectedFiles(changedFilePath: string): Set<string> {
    const affected = new Set<string>();
    const queue: string[] = [path.normalize(changedFilePath)];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      
      if (visited.has(current)) {
        continue;
      }
      visited.add(current);

      // Get direct dependents
      const dependents = this.getDependents(current);
      for (const dependent of dependents) {
        affected.add(dependent);
        queue.push(dependent);
      }
      
      // Get files that inherit from this file (reverse inheritance)
      const inheritors = this.getInheritors(current);
      for (const inheritor of inheritors) {
        affected.add(inheritor);
        queue.push(inheritor);
      }
    }

    return affected;
  }

  /**
   * Get files that inherit from the given file
   */
  private getInheritors(filePath: string): string[] {
    const normalizedPath = path.normalize(filePath);
    const inheritors: string[] = [];
    
    for (const [file, inheritedFiles] of this.inheritanceGraph.entries()) {
      if (inheritedFiles.has(normalizedPath)) {
        inheritors.push(file);
      }
    }
    
    return inheritors;
  }

  /**
   * Get full inheritance chain for a file
   */
  getInheritanceChain(filePath: string): string[] {
    const normalizedPath = path.normalize(filePath);
    const chain: string[] = [];
    const visited = new Set<string>();
    const queue: string[] = [normalizedPath];
    
    while (queue.length > 0) {
      const current = queue.shift()!;
      
      if (visited.has(current)) {
        continue;
      }
      visited.add(current);
      
      const inherited = this.inheritanceGraph.get(current);
      if (inherited) {
        for (const parent of inherited) {
          chain.push(parent);
          queue.push(parent);
        }
      }
    }
    
    return chain;
  }

  /**
   * Update dependency for a single file
   */
  updateDependency(filePath: string): void {
    const normalizedPath = path.normalize(filePath);
    
    // Remove old reverse dependencies
    const oldDeps = this.dependencyGraph.get(normalizedPath);
    if (oldDeps) {
      for (const dep of oldDeps) {
        const reverseDeps = this.reverseDependencyGraph.get(dep);
        if (reverseDeps) {
          reverseDeps.delete(normalizedPath);
          if (reverseDeps.size === 0) {
            this.reverseDependencyGraph.delete(dep);
          }
        }
      }
    }

    // Analyze new dependencies
    const newDeps = this.analyzeDependencies(normalizedPath);
    this.dependencyGraph.set(normalizedPath, new Set(newDeps));

    // Update reverse dependencies
    for (const dep of newDeps) {
      if (!this.reverseDependencyGraph.has(dep)) {
        this.reverseDependencyGraph.set(dep, new Set());
      }
      this.reverseDependencyGraph.get(dep)!.add(normalizedPath);
    }
  }

  /**
   * Remove file from dependency graph
   */
  removeDependency(filePath: string): void {
    const normalizedPath = path.normalize(filePath);
    
    // Remove from dependency graph
    const deps = this.dependencyGraph.get(normalizedPath);
    if (deps) {
      for (const dep of deps) {
        const reverseDeps = this.reverseDependencyGraph.get(dep);
        if (reverseDeps) {
          reverseDeps.delete(normalizedPath);
          if (reverseDeps.size === 0) {
            this.reverseDependencyGraph.delete(dep);
          }
        }
      }
    }
    this.dependencyGraph.delete(normalizedPath);

    // Remove from reverse dependency graph
    this.reverseDependencyGraph.delete(normalizedPath);
  }

  /**
   * Check if a file is a DTO/model file
   */
  isDtoFile(filePath: string): boolean {
    const normalizedPath = path.normalize(filePath);
    const fileName = path.basename(normalizedPath, '.ts');
    
    // Common DTO/model naming patterns
    const dtoPatterns = [
      /\.dto$/i,
      /\.model$/i,
      /\.entity$/i,
      /\.interface$/i,
      /\.type$/i,
    ];

    return dtoPatterns.some(pattern => pattern.test(fileName));
  }

  /**
   * Get dependency info for a file
   */
  getDependencyInfo(filePath: string): DependencyInfo {
    const normalizedPath = path.normalize(filePath);
    
    return {
      filePath: normalizedPath,
      dependencies: this.getDependencies(normalizedPath),
      dependents: this.getDependents(normalizedPath),
      inheritanceChain: this.getInheritanceChain(normalizedPath),
      transitiveAffected: Array.from(this.getAffectedFiles(normalizedPath)),
    };
  }

  /**
   * Export graph for debugging
   */
  exportGraph(): {
    dependencies: Record<string, string[]>;
    reverseDependencies: Record<string, string[]>;
  } {
    return {
      dependencies: Object.fromEntries(
        Array.from(this.dependencyGraph.entries()).map(([key, value]) => [
          key,
          Array.from(value),
        ])
      ),
      reverseDependencies: Object.fromEntries(
        Array.from(this.reverseDependencyGraph.entries()).map(([key, value]) => [
          key,
          Array.from(value),
        ])
      ),
    };
  }
}
