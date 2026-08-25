/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import * as fs from 'fs';
import * as path from 'path';
import { ScrambleLogger } from './ScrambleLogger';

export interface ProjectStructure {
  rootPath: string;
  sourcePath: string;
  packageJson: any;
  tsConfigPath: string;
  hasControllers: boolean;
  controllerPaths: string[];
}

/** Directory names that are never part of a project's own source. */
const IGNORED_DIRECTORIES = new Set(['node_modules', 'dist', 'build', 'coverage', '.git']);

/** Candidate source directories, in order of preference. */
const SOURCE_CANDIDATES = ['src', 'lib', 'app', 'source'];

/**
 * Depth limit for the source scan.
 *
 * Deep enough for any realistic layout while keeping startup cheap on large
 * trees.
 */
const MAX_SCAN_DEPTH = 8;

/**
 * Addresses a server binds to but a client cannot connect to.
 *
 * `HOST=0.0.0.0` is the norm in containers, and it used to be copied straight
 * into the documented server URL. A browser cannot reach `http://0.0.0.0`, so
 * the docs UI pointed "Try it" at an unusable address.
 */
const WILDCARD_HOSTS = new Set(['0.0.0.0', '::', '[::]', '::0', '0']);

export class AutoDetector {
  /**
   * Auto-detect the project structure and configuration
   */
  static detectProjectStructure(): ProjectStructure {
    const rootPath = process.cwd();
    
    // Try to find package.json
    const packageJsonPath = path.join(rootPath, 'package.json');
    let packageJson: any = {};
    
    if (fs.existsSync(packageJsonPath)) {
      try {
        packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      } catch (error) {
        ScrambleLogger.warn('Could not parse package.json');
      }
    }

    // Auto-detect source path
    const sourcePath = this.detectSourcePath(rootPath);
    
    // Find tsconfig.json
    const tsConfigPath = this.detectTsConfig(rootPath);
    
    // Find controllers
    const controllerPaths = this.findControllers(path.join(rootPath, sourcePath));
    
    return {
      rootPath,
      sourcePath,
      packageJson,
      tsConfigPath,
      hasControllers: controllerPaths.length > 0,
      controllerPaths,
    };
  }

  /**
   * Auto-detect the source directory.
   *
   * A directory that actually declares a controller wins over one that merely
   * holds TypeScript, because that is the signal the library needs. The previous
   * check looked only at the top level of each candidate, so a project whose
   * source lives entirely in subdirectories was not detected and the user saw
   * "No controllers found" with nothing to act on.
   */
  private static detectSourcePath(rootPath: string): string {
    const existing = SOURCE_CANDIDATES.filter(candidate => {
      const fullPath = path.join(rootPath, candidate);
      return fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory();
    });

    for (const candidate of existing) {
      if (this.findControllers(path.join(rootPath, candidate)).length > 0) {
        return candidate;
      }
    }

    for (const candidate of existing) {
      if (this.hasTypeScriptFiles(path.join(rootPath, candidate))) {
        return candidate;
      }
    }

    return 'src';
  }

  /**
   * Detect tsconfig.json location
   */
  private static detectTsConfig(rootPath: string): string {
    const possiblePaths = [
      'tsconfig.json',
      'tsconfig.app.json',
      'tsconfig.build.json',
    ];
    
    for (const possiblePath of possiblePaths) {
      const fullPath = path.join(rootPath, possiblePath);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }
    
    return path.join(rootPath, 'tsconfig.json');
  }

  /**
   * Checks for TypeScript files anywhere under a directory.
   *
   * The scan is recursive because many projects keep no `.ts` file at the top
   * level of their source directory; a shallow check reported those as empty.
   */
  private static hasTypeScriptFiles(dirPath: string, depth = 0): boolean {
    if (depth > MAX_SCAN_DEPTH) return false;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return false;
    }

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.ts')) {
        return true;
      }
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || IGNORED_DIRECTORIES.has(entry.name)) continue;
      if (this.hasTypeScriptFiles(path.join(dirPath, entry.name), depth + 1)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Find all controller files recursively
   */
  private static findControllers(dirPath: string, controllers: string[] = [], depth = 0): string[] {
    if (depth > MAX_SCAN_DEPTH || !fs.existsSync(dirPath)) {
      return controllers;
    }

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          if (!IGNORED_DIRECTORIES.has(entry.name)) {
            this.findControllers(fullPath, controllers, depth + 1);
          }
        } else if (entry.isFile() && entry.name.endsWith('.controller.ts')) {
          controllers.push(fullPath);
        }
      }
    } catch (error) {
      // Silently skip directories we cannot read.
    }

    return controllers;
  }

  /**
   * Reads the port from the environment.
   *
   * The value is validated because `parseInt('abc')` returns `NaN`, which used to
   * end up in the documented server URL as `http://localhost:NaN`.
   */
  static detectPort(): number {
    const raw = process.env.PORT;
    if (!raw) return 3000;

    const parsed = Number(raw.trim());
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      ScrambleLogger.warn(`Ignoring invalid PORT value "${raw}"; using 3000 instead`);
      return 3000;
    }

    return parsed;
  }

  /**
   * Builds the base URL advertised in the document and the docs UI.
   *
   * A wildcard bind address is rewritten to `localhost`: `0.0.0.0` is where the
   * server listens, not somewhere a client can connect, so copying it into the
   * spec produced a "Try it" button that could never work.
   */
  static detectBaseUrl(): string {
    const port = this.detectPort();
    const rawHost = (process.env.HOST || '').trim();
    const host = !rawHost || WILDCARD_HOSTS.has(rawHost) ? 'localhost' : rawHost;

    return `http://${host}:${port}`;
  }

  /**
   * Get app name from package.json or default
   */
  static getAppName(): string {
    try {
      const packageJsonPath = path.join(process.cwd(), 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        return packageJson.name || 'NestJS API';
      }
    } catch {
      // Ignore
    }
    return 'NestJS API';
  }

  /**
   * Get app version from package.json or default
   */
  static getAppVersion(): string {
    try {
      const packageJsonPath = path.join(process.cwd(), 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        return packageJson.version || '1.0.0';
      }
    } catch {
      // Ignore
    }
    return '1.0.0';
  }
}
