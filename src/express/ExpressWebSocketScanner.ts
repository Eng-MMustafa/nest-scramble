/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import * as fs from 'fs';
import * as path from 'path';

export interface ExpressWebSocketEvent {
  event: string;
  summary?: string;
}

export interface ExpressWebSocketGateway {
  name: string;
  filePath: string;
  events: ExpressWebSocketEvent[];
}

const IGNORED_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', 'test', 'tests', '__tests__']);

/**
 * Heuristic scanner for Socket.IO events in Express/Node.js projects.
 *
 * It looks for `socket.on('eventName', ...)` calls anywhere in the source
 * files and groups them as a single gateway per file. Because Express WebSocket
 * code is dynamic, this is a best-effort helper that covers the common
 * `io.on('connection', (socket) => { socket.on('event', ...) })` pattern.
 */
export class ExpressWebSocketScanner {
  static scan(sourcePath: string): ExpressWebSocketGateway[] {
    const absolutePath = path.resolve(sourcePath);
    if (!fs.existsSync(absolutePath)) return [];

    const gateways: ExpressWebSocketGateway[] = [];
    const files = this.collectFiles(absolutePath);

    for (const file of files) {
      const text = fs.readFileSync(file, 'utf-8');
      if (!/socket\.on\s*\(/.test(text) && !/io\.on\s*\(\s*['"]connection['"]/.test(text)) {
        continue;
      }

      const events = this.extractEvents(text);
      if (events.length === 0) continue;

      const relative = path.relative(absolutePath, file).replace(/[\\/]/g, '/');
      const baseName = path.basename(file, path.extname(file));
      const dirName = path.dirname(relative);
      const tag = dirName === '.' ? baseName : `${dirName}/${baseName}`;

      gateways.push({
        name: tag,
        filePath: file,
        events,
      });
    }

    return gateways;
  }

  private static collectFiles(dir: string, out: string[] = [], depth = 0): string[] {
    if (depth > 8) return out;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return out;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          this.collectFiles(full, out, depth + 1);
        }
      } else if (entry.isFile() && /\.(js|ts|mjs|cjs)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
        out.push(full);
      }
    }

    return out;
  }

  private static extractEvents(text: string): ExpressWebSocketEvent[] {
    const events: ExpressWebSocketEvent[] = [];
    const seen = new Set<string>();
    const eventPattern = /socket\.on\s*\(\s*['"\`]([^'"\`]+)['"\`]\s*,/g;

    let match: RegExpExecArray | null;
    const ignoredEvents = new Set(['connection', 'disconnect', 'connect', 'connect_error', 'reconnect']);
    while ((match = eventPattern.exec(text)) !== null) {
      const eventName = match[1];
      if (ignoredEvents.has(eventName) || seen.has(eventName)) continue;
      seen.add(eventName);
      events.push({ event: eventName, summary: `Listen to ${eventName}` });
    }

    return events;
  }
}
