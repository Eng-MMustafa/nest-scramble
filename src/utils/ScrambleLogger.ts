/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import { Logger } from '@nestjs/common';

export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

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
  private static readonly logger = new Logger('Nest-Scramble');

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
