/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import type * as chokidar from 'chokidar';
import * as path from 'path';
import { CacheManager } from '../cache/CacheManager';
import { ScrambleLogger } from '../utils/ScrambleLogger';

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

  /**
   * Loads chokidar on demand.
   *
   * chokidar is an optional peer dependency: it is only needed for watch mode.
   * Requiring it lazily keeps `import 'nest-scramble'` working in production
   * installs (`npm ci --omit=dev`) where chokidar is not present.
   */
  private static loadChokidar(): typeof chokidar {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return require('chokidar');
    } catch {
      throw new Error(
        '[Nest-Scramble] Watch mode requires the optional peer dependency "chokidar".\n' +
          '  Install it with: npm install chokidar\n' +
          '  Or disable watch mode to avoid this dependency.',
      );
    }
  }

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
      ScrambleLogger.info('[FileWatcher] Already watching');
      return;
    }

    const watchPattern = path.join(this.options.sourcePath, '**/*.ts');
    
    ScrambleLogger.info(`[FileWatcher] Starting file watcher on: ${watchPattern}`);

    const chokidarModule = FileWatcher.loadChokidar();

    this.watcher = chokidarModule.watch(watchPattern, {
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
      .on('error', (error) => ScrambleLogger.error('[FileWatcher] Error:', error))
      .on('ready', () => {
        this.isWatching = true;
        ScrambleLogger.info('[FileWatcher] Ready and watching for changes');
      });
  }

  /**
   * Stop watching files
   */
  async stop(): Promise<void> {
    if (!this.watcher) {
      return;
    }

    ScrambleLogger.info('[FileWatcher] Stopping file watcher');
    
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
        ScrambleLogger.info(`[FileWatcher] No content change detected for: ${normalizedPath}`);
        return;
      }
    }

    const event: FileChangeEvent = {
      type,
      filePath: normalizedPath,
      hash,
    };

    this.pendingChanges.set(normalizedPath, event);
    
    ScrambleLogger.info(`[FileWatcher] File ${type}: ${normalizedPath}`);
    
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

    ScrambleLogger.info(`[FileWatcher] Processing ${events.length} file change(s)`);

    if (this.options.onFileChange) {
      try {
        await this.options.onFileChange(events);
      } catch (error) {
        ScrambleLogger.error('[FileWatcher] Error in file change handler:', error);
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
