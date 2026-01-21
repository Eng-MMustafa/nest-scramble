/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { ControllerInfo } from '../scanner/ScannerService';

export interface CacheMetadata {
  version: string;
  timestamp: number;
  tsConfigHash?: string;
  controllers: Map<string, CachedController>;
  dependencies: Map<string, Set<string>>;
}

export interface CachedController {
  filePath: string;
  fileHash: string;
  fileSize: number;
  controllerInfo: ControllerInfo;
  dependencies: string[];
  lastScanned: number;
}

export interface CacheOptions {
  cacheFilePath?: string;
  enabled?: boolean;
  ttl?: number;
  hashAlgorithm?: 'md5' | 'sha256';
}

export class CacheManager {
  private static readonly CACHE_VERSION = '1.0.0';
  private static readonly DEFAULT_CACHE_FILE = 'scramble-cache.json';
  
  private cacheFilePath: string;
  private enabled: boolean;
  private ttl: number;
  private hashAlgorithm: 'md5' | 'sha256';
  private metadata: CacheMetadata;
  private hashCollisions: Map<string, number> = new Map();

  constructor(options: CacheOptions = {}) {
    this.cacheFilePath = options.cacheFilePath || 
      path.join(process.cwd(), CacheManager.DEFAULT_CACHE_FILE);
    this.enabled = options.enabled !== false;
    this.ttl = options.ttl || 24 * 60 * 60 * 1000; // 24 hours default
    this.hashAlgorithm = options.hashAlgorithm || 'md5';
    
    this.metadata = {
      version: CacheManager.CACHE_VERSION,
      timestamp: Date.now(),
      controllers: new Map(),
      dependencies: new Map(),
    };
  }

  /**
   * Load cache from disk
   */
  load(): boolean {
    if (!this.enabled) {
      console.log('[CacheManager] Cache is disabled');
      return false;
    }

    try {
      if (!fs.existsSync(this.cacheFilePath)) {
        console.log('[CacheManager] No cache file found, starting fresh');
        return false;
      }

      const cacheData = fs.readFileSync(this.cacheFilePath, 'utf-8');
      const parsed = JSON.parse(cacheData);

      // Version check
      if (parsed.version !== CacheManager.CACHE_VERSION) {
        console.log('[CacheManager] Cache version mismatch, invalidating cache');
        return false;
      }

      // TTL check
      const age = Date.now() - parsed.timestamp;
      if (age > this.ttl) {
        console.log('[CacheManager] Cache expired, invalidating');
        return false;
      }

      // Reconstruct Maps from JSON
      this.metadata = {
        version: parsed.version,
        timestamp: parsed.timestamp,
        tsConfigHash: parsed.tsConfigHash,
        controllers: new Map(Object.entries(parsed.controllers || {})),
        dependencies: new Map(
          Object.entries(parsed.dependencies || {}).map(([key, value]) => [
            key,
            new Set(value as string[]),
          ])
        ),
      };

      console.log(`[CacheManager] Loaded cache with ${this.metadata.controllers.size} controller(s)`);
      return true;
    } catch (error) {
      console.error('[CacheManager] Error loading cache:', error);
      return false;
    }
  }

  /**
   * Save cache to disk
   */
  save(): boolean {
    if (!this.enabled) {
      return false;
    }

    try {
      // Convert Maps to plain objects for JSON serialization
      const serializable = {
        version: this.metadata.version,
        timestamp: Date.now(),
        tsConfigHash: this.metadata.tsConfigHash,
        controllers: Object.fromEntries(this.metadata.controllers),
        dependencies: Object.fromEntries(
          Array.from(this.metadata.dependencies.entries()).map(([key, value]) => [
            key,
            Array.from(value),
          ])
        ),
      };

      fs.writeFileSync(
        this.cacheFilePath,
        JSON.stringify(serializable, null, 2),
        'utf-8'
      );

      console.log(`[CacheManager] Cache saved to ${this.cacheFilePath}`);
      return true;
    } catch (error) {
      console.error('[CacheManager] Error saving cache:', error);
      return false;
    }
  }

  /**
   * Get cached controller by file path
   */
  getController(filePath: string): CachedController | undefined {
    return this.metadata.controllers.get(filePath);
  }

  /**
   * Set or update cached controller
   */
  setController(filePath: string, cached: CachedController): void {
    this.metadata.controllers.set(filePath, cached);
  }

  /**
   * Remove controller from cache
   */
  removeController(filePath: string): void {
    this.metadata.controllers.delete(filePath);
    
    // Clean up dependencies
    this.metadata.dependencies.delete(filePath);
    
    // Remove from other controllers' dependencies
    for (const [key, deps] of this.metadata.dependencies.entries()) {
      deps.delete(filePath);
      if (deps.size === 0) {
        this.metadata.dependencies.delete(key);
      }
    }
  }

  /**
   * Get all cached controllers
   */
  getAllControllers(): Map<string, CachedController> {
    return this.metadata.controllers;
  }

  /**
   * Add dependency relationship
   */
  addDependency(controllerPath: string, dependencyPath: string): void {
    if (!this.metadata.dependencies.has(controllerPath)) {
      this.metadata.dependencies.set(controllerPath, new Set());
    }
    this.metadata.dependencies.get(controllerPath)!.add(dependencyPath);
  }

  /**
   * Get controllers that depend on a specific file
   */
  getDependentControllers(filePath: string): string[] {
    const dependents: string[] = [];
    
    for (const [controllerPath, deps] of this.metadata.dependencies.entries()) {
      if (deps.has(filePath)) {
        dependents.push(controllerPath);
      }
    }
    
    return dependents;
  }

  /**
   * Check if a file's hash has changed
   * Uses multi-layer verification: hash + file size
   */
  hasFileChanged(filePath: string, currentHash: string): boolean {
    const cached = this.metadata.controllers.get(filePath);
    if (!cached) {
      return true; // New file
    }
    
    // Primary check: hash comparison
    if (cached.fileHash !== currentHash) {
      return true;
    }
    
    // Secondary check: file size verification (collision detection)
    try {
      const currentSize = fs.statSync(filePath).size;
      if (cached.fileSize !== currentSize) {
        console.warn(`[CacheManager] Hash collision detected for ${filePath}`);
        console.warn(`[CacheManager] Hash: ${currentHash}, but size differs: ${cached.fileSize} vs ${currentSize}`);
        this.trackHashCollision(currentHash);
        return true;
      }
    } catch (error) {
      // File doesn't exist or can't be read
      return true;
    }
    
    return false;
  }

  /**
   * Track hash collisions for monitoring
   */
  private trackHashCollision(hash: string): void {
    const count = this.hashCollisions.get(hash) || 0;
    this.hashCollisions.set(hash, count + 1);
    
    if (count >= 3) {
      console.error(`[CacheManager] ⚠️  Multiple hash collisions detected (${count + 1}x) for hash: ${hash}`);
      console.error(`[CacheManager] Consider switching to SHA-256 for better collision resistance`);
    }
  }

  /**
   * Calculate file hash using MD5 or SHA-256
   */
  static calculateFileHash(filePath: string, algorithm: 'md5' | 'sha256' = 'md5'): string {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return crypto.createHash(algorithm).update(content).digest('hex');
    } catch (error) {
      console.error(`[CacheManager] Error calculating hash for ${filePath}:`, error);
      return '';
    }
  }

  /**
   * Calculate file hash with the instance's configured algorithm
   */
  calculateHash(filePath: string): string {
    return CacheManager.calculateFileHash(filePath, this.hashAlgorithm);
  }

  /**
   * Get file size
   */
  static getFileSize(filePath: string): number {
    try {
      return fs.statSync(filePath).size;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Calculate hash for tsconfig.json
   */
  calculateTsConfigHash(tsConfigPath: string): string {
    return this.calculateHash(tsConfigPath);
  }

  /**
   * Set tsconfig hash
   */
  setTsConfigHash(hash: string): void {
    this.metadata.tsConfigHash = hash;
  }

  /**
   * Check if tsconfig has changed
   */
  hasTsConfigChanged(currentHash: string): boolean {
    if (!this.metadata.tsConfigHash) {
      return true;
    }
    return this.metadata.tsConfigHash !== currentHash;
  }

  /**
   * Invalidate entire cache
   */
  invalidate(): void {
    this.metadata = {
      version: CacheManager.CACHE_VERSION,
      timestamp: Date.now(),
      controllers: new Map(),
      dependencies: new Map(),
    };
    
    if (fs.existsSync(this.cacheFilePath)) {
      try {
        fs.unlinkSync(this.cacheFilePath);
        console.log('[CacheManager] Cache invalidated and file removed');
      } catch (error) {
        console.error('[CacheManager] Error removing cache file:', error);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    controllerCount: number;
    dependencyCount: number;
    cacheAge: number;
    cacheSize: number;
    hashAlgorithm: string;
    hashCollisions: number;
  } {
    let cacheSize = 0;
    if (fs.existsSync(this.cacheFilePath)) {
      cacheSize = fs.statSync(this.cacheFilePath).size;
    }

    const totalCollisions = Array.from(this.hashCollisions.values()).reduce((sum, count) => sum + count, 0);

    return {
      controllerCount: this.metadata.controllers.size,
      dependencyCount: this.metadata.dependencies.size,
      cacheAge: Date.now() - this.metadata.timestamp,
      cacheSize,
      hashAlgorithm: this.hashAlgorithm,
      hashCollisions: totalCollisions,
    };
  }

  /**
   * Cleanup old entries based on file existence
   */
  cleanup(): number {
    let removed = 0;
    
    for (const [filePath] of this.metadata.controllers.entries()) {
      if (!fs.existsSync(filePath)) {
        this.removeController(filePath);
        removed++;
      }
    }
    
    if (removed > 0) {
      console.log(`[CacheManager] Cleaned up ${removed} stale cache entries`);
    }
    
    return removed;
  }
}
