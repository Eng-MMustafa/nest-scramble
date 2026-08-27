/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

/** The subset of the NestJS `Logger` surface this wrapper uses. */
interface LoggerLike {
  log(message: string): void;
  warn(message: string): void;
  error(message: string, trace?: string): void;
  debug(message: string): void;
}

/**
 * Resolves the NestJS logger lazily.
 *
 * `@nestjs/common` is a peer dependency of the *module*, but the CLI
 * (`generate`, `diff`, `doctor`, `changelog`, `test`) needs nothing from
 * NestJS — it reads source files. A static import here made the whole CLI
 * crash at require time in any environment without NestJS installed, such as
 * a CI job that only checks out two source trees to diff them.
 */
function createLogger(): LoggerLike {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Logger } = require('@nestjs/common');
    return new Logger('Nest-Scramble');
  } catch {
    const prefix = '[Nest-Scramble]';
    return {
      // eslint-disable-next-line no-console
      log: (message: string) => console.log(`${prefix} ${message}`),
      // eslint-disable-next-line no-console
      warn: (message: string) => console.warn(`${prefix} ${message}`),
      error: (message: string, trace?: string) =>
        // eslint-disable-next-line no-console
        console.error(`${prefix} ${message}`, ...(trace ? [trace] : [])),
      // eslint-disable-next-line no-console
      debug: (message: string) => console.debug(`${prefix} ${message}`),
    };
  }
}

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

/**
 * Thin wrapper over the NestJS logger so library output is:
 *   - routed through the host application's configured logger
 *   - silenceable, which matters in CI and structured-JSON logging setups
 *
 * Previously every message went straight to `console.log` with no way to turn
 * it off.
 */
export class ScrambleLogger {
  private static level: LogLevel = 'info';
  private static readonly logger: LoggerLike = createLogger();

  static configure(level: LogLevel | undefined): void {
    if (level && level in LEVEL_WEIGHT) {
      ScrambleLogger.level = level;
    }
  }

  static getLevel(): LogLevel {
    return ScrambleLogger.level;
  }

  static isEnabled(level: Exclude<LogLevel, 'silent'>): boolean {
    return LEVEL_WEIGHT[ScrambleLogger.level] >= LEVEL_WEIGHT[level];
  }

  static info(message: string): void {
    if (ScrambleLogger.isEnabled('info')) {
      ScrambleLogger.logger.log(message);
    }
  }

  static warn(message: string): void {
    if (ScrambleLogger.isEnabled('warn')) {
      ScrambleLogger.logger.warn(message);
    }
  }

  static error(message: string, trace?: unknown): void {
    if (ScrambleLogger.isEnabled('error')) {
      ScrambleLogger.logger.error(message, trace as string | undefined);
    }
  }

  static debug(message: string): void {
    if (ScrambleLogger.isEnabled('debug')) {
      ScrambleLogger.logger.debug(message);
    }
  }

  /**
   * Writes a pre-formatted multi-line block (the startup banner) without the
   * per-line logger prefix, which would break its alignment.
   */
  static raw(lines: string[]): void {
    if (!ScrambleLogger.isEnabled('info')) return;
    for (const line of lines) {
      // eslint-disable-next-line no-console
      console.log(line);
    }
  }
}
