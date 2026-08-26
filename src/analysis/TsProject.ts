/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

/**
 * A thin project wrapper over the TypeScript compiler API.
 *
 * This replaces ts-morph. Every NestJS project already ships the `typescript`
 * package — it is a peer dependency of this library — while ts-morph bundles a
 * second copy of the compiler inside `@ts-morph/common`. Driving the compiler
 * directly removes the largest runtime dependency without changing what the
 * scanner can see.
 *
 * The program is rebuilt lazily whenever the file set changes or a refresh is
 * requested; `ts.Program` is immutable, and a rebuild with the default host
 * re-reads changed files from disk, which is exactly the semantics the watch
 * mode needs.
 */
export class TsProject {
  private readonly options: ts.CompilerOptions;
  /** Canonical (resolved, forward-slash) paths of the files under analysis. */
  private readonly fileNames = new Set<string>();
  private program: ts.Program | null = null;
  private dirty = true;

  constructor(tsConfigFilePath?: string) {
    this.options = loadCompilerOptions(tsConfigFilePath);
  }

  /** Canonical form used for every path comparison, including on Windows. */
  static normalizePath(filePath: string): string {
    return path.resolve(filePath).replace(/\\/g, '/');
  }

  /** Recursively adds every `.ts` file below `dir`, skipping `node_modules`. */
  addSourceFilesInDirectory(dir: string): void {
    const root = path.resolve(dir);
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
      return;
    }

    const stack: string[] = [root];
    while (stack.length > 0) {
      const current = stack.pop()!;
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
            stack.push(full);
          }
        } else if (entry.isFile() && entry.name.endsWith('.ts')) {
          this.fileNames.add(TsProject.normalizePath(full));
        }
      }
    }

    this.dirty = true;
  }

  addSourceFileAtPath(filePath: string): ts.SourceFile {
    const normalized = TsProject.normalizePath(filePath);
    if (!fs.existsSync(normalized)) {
      throw new Error(`File not found: ${filePath}`);
    }
    this.fileNames.add(normalized);
    this.dirty = true;

    const sourceFile = this.getSourceFile(normalized);
    if (!sourceFile) {
      throw new Error(`Failed to load source file: ${filePath}`);
    }
    return sourceFile;
  }

  removeSourceFile(filePath: string): void {
    this.fileNames.delete(TsProject.normalizePath(filePath));
    this.dirty = true;
  }

  /** Marks the program stale so the next query re-reads files from disk. */
  refresh(): void {
    this.dirty = true;
  }

  /** The source files that were explicitly added — not libs or dependencies. */
  getSourceFiles(): ts.SourceFile[] {
    const program = this.getProgram();
    const files: ts.SourceFile[] = [];
    for (const fileName of this.fileNames) {
      const sourceFile = program.getSourceFile(fileName);
      if (sourceFile) {
        files.push(sourceFile);
      }
    }
    return files;
  }

  getSourceFile(filePath: string): ts.SourceFile | undefined {
    return this.getProgram().getSourceFile(TsProject.normalizePath(filePath));
  }

  getChecker(): ts.TypeChecker {
    return this.getProgram().getTypeChecker();
  }

  private getProgram(): ts.Program {
    if (this.dirty || !this.program) {
      this.program = ts.createProgram({
        rootNames: [...this.fileNames],
        options: this.options,
      });
      this.dirty = false;
    }
    return this.program;
  }
}

/**
 * Reads the compiler options from the host project's tsconfig. Only the
 * options are taken — the file set always comes from the scanned directory,
 * mirroring the previous `skipAddingFilesFromTsConfig` behaviour.
 */
function loadCompilerOptions(tsConfigFilePath?: string): ts.CompilerOptions {
  const fallback: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS,
    experimentalDecorators: true,
    strict: true,
  };

  if (!tsConfigFilePath || !fs.existsSync(tsConfigFilePath)) {
    return fallback;
  }

  const read = ts.readConfigFile(tsConfigFilePath, ts.sys.readFile);
  if (read.error || !read.config) {
    return fallback;
  }

  const parsed = ts.parseJsonConfigFileContent(
    read.config,
    ts.sys,
    path.dirname(tsConfigFilePath),
  );
  return parsed.options;
}
