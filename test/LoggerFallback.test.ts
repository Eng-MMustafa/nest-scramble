/**
 * Tests for the logger fallback used when `@nestjs/common` is not installed.
 *
 * The CLI (`generate`, `diff`, `doctor`, `changelog`, `test`) reads source
 * files and needs nothing from NestJS, but a static `Logger` import made every
 * command crash at require time in environments without NestJS — such as a CI
 * job that only checks out two source trees to diff them.
 */

describe('ScrambleLogger without @nestjs/common', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('falls back to a console logger when @nestjs/common cannot be loaded', () => {
    jest.isolateModules(() => {
      jest.doMock('@nestjs/common', () => {
        throw new Error("Cannot find module '@nestjs/common'");
      });

      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      // Must not throw at require time — that was the bug.
      const { ScrambleLogger } = require('../src/utils/ScrambleLogger');

      ScrambleLogger.configure('info');
      ScrambleLogger.info('scanning');
      ScrambleLogger.warn('careful');
      ScrambleLogger.error('broken', 'trace');

      expect(logSpy).toHaveBeenCalledWith('[Nest-Scramble] scanning');
      expect(warnSpy).toHaveBeenCalledWith('[Nest-Scramble] careful');
      expect(errorSpy).toHaveBeenCalledWith('[Nest-Scramble] broken', 'trace');

      jest.dontMock('@nestjs/common');
    });
  });

  it('still honours the configured level in fallback mode', () => {
    jest.isolateModules(() => {
      jest.doMock('@nestjs/common', () => {
        throw new Error("Cannot find module '@nestjs/common'");
      });

      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      const { ScrambleLogger } = require('../src/utils/ScrambleLogger');

      ScrambleLogger.configure('silent');
      ScrambleLogger.info('should not appear');

      expect(logSpy).not.toHaveBeenCalled();

      ScrambleLogger.configure('info');
      jest.dontMock('@nestjs/common');
    });
  });

  it('uses the NestJS logger when @nestjs/common is available', () => {
    jest.isolateModules(() => {
      const { ScrambleLogger } = require('../src/utils/ScrambleLogger');
      const { Logger } = require('@nestjs/common');
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});

      ScrambleLogger.configure('info');
      ScrambleLogger.info('through nest');

      expect(logSpy).toHaveBeenCalledWith('through nest');
    });
  });
});
