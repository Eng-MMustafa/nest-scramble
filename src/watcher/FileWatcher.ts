/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import * as chokidar from 'chokidar';
import * as path from 'path';
import { CacheManager } from '../cache/CacheManager';

export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink';
  filePath: string;
  hash?: string;
}

export interface WatcherOptions {
  sourcePath: string;
  cacheManager: CacheManager;
  ignored?: string[];
  debounceMs?: number;
  onFileChange?: (events: FileChangeEvent[]) => void | Promise<void>;
}

export class FileWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private options: WatcherOptions;
  private pendingChanges: Map<string, FileChangeEvent> = new Map();
  private debounceTimer: NodeJS.Timeout | null = null;
  private isWatching = false;

  constructor(options: WatcherOptions) {
    this.options = {
      ...options,
      ignored: options.ignored || [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/build/**',
        '**/*.spec.ts',
        '**/*.test.ts',
      ],
      debounceMs: options.debounceMs || 300,
    };
  }

  /**
   * Start watching files
   */
  start(): void {
    if (this.isWatching) {
      console.log('[FileWatcher] Already watching');
      return;
    }

    const watchPattern = path.join(this.options.sourcePath, '**/*.ts');
    
    console.log(`[FileWatcher] Starting file watcher on: ${watchPattern}`);
    
    this.watcher = chokidar.watch(watchPattern, {
      ignored: this.options.ignored,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    this.watcher
      .on('add', (filePath) => this.handleFileEvent('add', filePath))
      .on('change', (filePath) => this.handleFileEvent('change', filePath))
      .on('unlink', (filePath) => this.handleFileEvent('unlink', filePath))
      .on('error', (error) => console.error('[FileWatcher] Error:', error))
      .on('ready', () => {
        this.isWatching = true;
        console.log('[FileWatcher] Ready and watching for changes');
      });
  }

  /**
   * Stop watching files
   */
  async stop(): Promise<void> {
    if (!this.watcher) {
      return;
    }

    console.log('[FileWatcher] Stopping file watcher');
    
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    await this.watcher.close();
    this.watcher = null;
    this.isWatching = false;
    this.pendingChanges.clear();
  }

  /**
   * Handle file events
   */
  private handleFileEvent(type: 'add' | 'change' | 'unlink', filePath: string): void {
    const normalizedPath = path.normalize(filePath);
    
    // Calculate hash for add/change events
    let hash: string | undefined;
    if (type !== 'unlink') {
      hash = CacheManager.calculateFileHash(normalizedPath);
      
      // Skip if hash hasn't changed
      if (type === 'change' && !this.options.cacheManager.hasFileChanged(normalizedPath, hash)) {
        console.log(`[FileWatcher] No content change detected for: ${normalizedPath}`);
        return;
      }
    }

    const event: FileChangeEvent = {
      type,
      filePath: normalizedPath,
      hash,
    };

    this.pendingChanges.set(normalizedPath, event);
    
    console.log(`[FileWatcher] File ${type}: ${normalizedPath}`);
    
    this.scheduleProcessing();
  }

  /**
   * Schedule debounced processing of file changes
   */
  private scheduleProcessing(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.processChanges();
    }, this.options.debounceMs);
  }

  /**
   * Process accumulated file changes
   */
  private async processChanges(): Promise<void> {
    if (this.pendingChanges.size === 0) {
      return;
    }

    const events = Array.from(this.pendingChanges.values());
    this.pendingChanges.clear();

    console.log(`[FileWatcher] Processing ${events.length} file change(s)`);

    if (this.options.onFileChange) {
      try {
        await this.options.onFileChange(events);
      } catch (error) {
        console.error('[FileWatcher] Error in file change handler:', error);
      }
    }
  }

  /**
   * Get watching status
   */
  isActive(): boolean {
    return this.isWatching;
  }

  /**
   * Get pending changes count
   */
  getPendingCount(): number {
    return this.pendingChanges.size;
  }

  /**
   * Manually trigger processing of pending changes
   */
  async flush(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    await this.processChanges();
  }
}
