/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import * as fs from 'fs';
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

/** Directory names that never contain user controllers. */
const IGNORED_DIRECTORIES = new Set(['node_modules', 'dist', 'build']);

/** True for the TypeScript sources the scanner cares about. */
function isWatchableFile(fileName: string): boolean {
  return (
    fileName.endsWith('.ts') &&
    !fileName.endsWith('.spec.ts') &&
    !fileName.endsWith('.test.ts') &&
    !fileName.endsWith('.d.ts')
  );
}

function isIgnoredDirectory(name: string): boolean {
  return IGNORED_DIRECTORIES.has(name) || name.startsWith('.');
}

/**
 * Watches a source tree for TypeScript changes using Node's own `fs.watch`.
 *
 * This used to require chokidar as an optional peer dependency — the last
 * external package in the project. Recursive `fs.watch` covers Windows and
 * macOS natively; on platforms without recursive support (older Linux), one
 * watcher per directory is maintained instead, including directories created
 * after startup.
 */
export class FileWatcher {
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private options: WatcherOptions;
  private pendingChanges: Map<string, FileChangeEvent> = new Map();
  private debounceTimer: NodeJS.Timeout | null = null;
  private isWatching = false;
  /** Files seen so far, to tell an `add` apart from a `change`. */
  private knownFiles: Set<string> = new Set();

  constructor(options: WatcherOptions) {
    this.options = {
      ...options,
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

    const root = path.resolve(this.options.sourcePath);

    if (!fs.existsSync(root)) {
      ScrambleLogger.error(`[FileWatcher] Source path not found: ${root}`);
      return;
    }

    ScrambleLogger.info(`[FileWatcher] Starting file watcher on: ${root}`);

    this.indexExistingFiles(root);

    try {
      this.watchRecursively(root);
    } catch {
      // Recursive fs.watch is unavailable on this platform (older Linux):
      // fall back to one watcher per directory.
      this.watchDirectoryTree(root);
    }

    this.isWatching = true;
    ScrambleLogger.info('[FileWatcher] Ready and watching for changes');
  }

  /** Records the files that already exist, so later events classify correctly. */
  private indexExistingFiles(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!isIgnoredDirectory(entry.name)) {
          this.indexExistingFiles(full);
        }
      } else if (entry.isFile() && isWatchableFile(entry.name)) {
        this.knownFiles.add(path.normalize(full));
      }
    }
  }

  /** Single watcher covering the whole tree (Windows, macOS, modern Linux). */
  private watchRecursively(root: string): void {
    const watcher = fs.watch(root, { recursive: true }, (_eventType, fileName) => {
      if (fileName) {
        this.classifyEvent(path.join(root, fileName.toString()));
      }
    });
    watcher.on('error', (error) => ScrambleLogger.error('[FileWatcher] Error:', error));
    this.watchers.set(root, watcher);
  }

  /** One watcher per directory, adding watchers for directories created later. */
  private watchDirectoryTree(dir: string): void {
    if (this.watchers.has(dir)) return;

    let watcher: fs.FSWatcher;
    try {
      watcher = fs.watch(dir, (_eventType, fileName) => {
        if (!fileName) return;
        const full = path.join(dir, fileName.toString());

        // A brand-new subdirectory needs its own watcher.
        try {
          if (fs.statSync(full).isDirectory()) {
            if (!isIgnoredDirectory(path.basename(full))) {
              this.watchDirectoryTree(full);
            }
            return;
          }
        } catch {
          // Removed entry: fall through, classifyEvent handles unlink.
        }

        this.classifyEvent(full);
      });
    } catch {
      return;
    }

    watcher.on('error', (error) => ScrambleLogger.error('[FileWatcher] Error:', error));
    this.watchers.set(dir, watcher);

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory() && !isIgnoredDirectory(entry.name)) {
        this.watchDirectoryTree(path.join(dir, entry.name));
      }
    }
  }

  /**
   * Maps a raw fs.watch notification to an add/change/unlink event.
   *
   * `fs.watch` only reports "something happened to this name"; whether that
   * was a creation, an edit or a deletion is derived from the file's current
   * existence and whether it was seen before.
   */
  private classifyEvent(fullPath: string): void {
    const normalized = path.normalize(fullPath);
    const baseName = path.basename(normalized);

    if (!isWatchableFile(baseName)) return;
    if (normalized.split(path.sep).some(isIgnoredDirectory)) return;

    if (fs.existsSync(normalized)) {
      const type = this.knownFiles.has(normalized) ? 'change' : 'add';
      this.knownFiles.add(normalized);
      this.handleFileEvent(type, normalized);
    } else if (this.knownFiles.has(normalized)) {
      this.knownFiles.delete(normalized);
      this.handleFileEvent('unlink', normalized);
    }
  }

  /**
   * Stop watching files
   */
  async stop(): Promise<void> {
    if (this.watchers.size === 0) {
      return;
    }

    ScrambleLogger.info('[FileWatcher] Stopping file watcher');

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
    this.knownFiles.clear();
    this.isWatching = false;
    this.pendingChanges.clear();
  }

  /**
   * Handle file events
   */
  private handleFileEvent(type: 'add' | 'change' | 'unlink', filePath: string): void {
    const normalizedPath = path.normalize(filePath);

    // Calculate hash for add/change events. fs.watch fires several raw
    // notifications per save; the hash comparison collapses them into one
    // logical change, which is what chokidar's awaitWriteFinish used to do.
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
