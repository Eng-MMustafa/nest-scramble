/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import * as fs from 'fs';
import * as path from 'path';

export interface DetectedPort {
  port: number;
  /** Where the value came from, for the startup log. */
  source: 'env-file' | 'listen' | 'default';
  evidence?: string;
}

const IGNORED_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', 'test', 'tests', '__tests__']);

/**
 * Works out which port the *application* listens on, so `nest-scramble serve`
 * can point "Try it" requests at it without a `--baseUrl` flag.
 *
 * Priority: `PORT=` in a `.env` file (what dotenv will load at runtime), then
 * the literal or fallback in `app.listen(...)` / `await app.listen(...)`,
 * then 3000.
 */
export class AppPortDetector {
  static detect(sourcePath: string, projectRoot: string = process.cwd()): DetectedPort {
    const fromEnv = this.fromEnvFiles(projectRoot);
    if (fromEnv) return fromEnv;

    const fromListen = this.fromListenCalls(sourcePath);
    if (fromListen) return fromListen;

    return { port: 3000, source: 'default' };
  }

  static baseUrl(sourcePath: string, projectRoot: string = process.cwd()): { url: string; detected: DetectedPort } {
    const detected = this.detect(sourcePath, projectRoot);
    return { url: `http://localhost:${detected.port}`, detected };
  }

  private static fromEnvFiles(projectRoot: string): DetectedPort | null {
    for (const name of ['.env', '.env.local', '.env.development']) {
      const file = path.join(projectRoot, name);
      let text: string;
      try {
        text = fs.readFileSync(file, 'utf-8');
      } catch {
        continue;
      }
      const m = /^\s*(?:export\s+)?PORT\s*=\s*["']?(\d{2,5})["']?\s*(?:#.*)?$/m.exec(text);
      if (m) return { port: Number(m[1]), source: 'env-file', evidence: `${name}: PORT=${m[1]}` };
    }
    return null;
  }

  private static fromListenCalls(sourcePath: string): DetectedPort | null {
    const files = this.collectFiles(path.resolve(sourcePath));
    // Entry points first: they are where listen() almost always lives.
    files.sort((a, b) => this.entryScore(b) - this.entryScore(a));

    for (const file of files) {
      let text: string;
      try {
        text = fs.readFileSync(file, 'utf-8');
      } catch {
        continue;
      }
      const listen = /\.listen\s*\(([^)]*)\)/.exec(text);
      if (!listen) continue;
      const args = listen[1];
      const relative = path.basename(file);

      // listen(4000) / listen(process.env.PORT || 4000) / listen({ port: 4000 })
      const literal = /\b(\d{2,5})\b/.exec(args);
      if (literal && this.plausible(Number(literal[1]))) {
        return { port: Number(literal[1]), source: 'listen', evidence: `${relative}: listen(${args.trim()})` };
      }
      // listen(PORT) / listen(config.port) → find the declaration's numeric fallback
      const ident = /^\s*\+?\s*([A-Za-z_$][\w$.]*)\s*(?:,|$)/.exec(args);
      if (ident) {
        const name = ident[1].split('.').pop()!;
        const decl = new RegExp(`(?:const|let|var)\\s+${name}\\s*(?::[^=]+)?=([^;\\n]+)`, 'i').exec(text)
          || new RegExp(`\\b${name}\\s*:\\s*([^,\\n}]+)`, 'i').exec(text);
        if (decl) {
          const num = /\b(\d{2,5})\b/.exec(decl[1]);
          if (num && this.plausible(Number(num[1]))) {
            return { port: Number(num[1]), source: 'listen', evidence: `${relative}: ${name} = ${decl[1].trim()}` };
          }
        }
      }
    }
    return null;
  }

  private static plausible(port: number): boolean {
    return port >= 80 && port <= 65535;
  }

  private static entryScore(file: string): number {
    const base = path.basename(file).toLowerCase();
    if (/^(main|server|index|app|bin|www)\.(ts|js|mjs|cjs)$/.test(base)) return 3;
    if (/(server|main|app|bootstrap)/.test(base)) return 2;
    return 0;
  }

  private static collectFiles(dir: string, out: string[] = [], depth = 0): string[] {
    if (depth > 6) return out;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return out;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) this.collectFiles(full, out, depth + 1);
      } else if (/\.(js|ts|mjs|cjs)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
        out.push(full);
      }
    }
    return out;
  }
}
