/**
 * Tests for the startup banner.
 *
 * This behaviour was previously only checked by an ad-hoc script at the repo
 * root (`test-baseurl-fix.js`) that had to be run by hand. That script also
 * captured `console.log`, so once output moved to the NestJS logger it silently
 * reported failure for behaviour that actually worked. Converting its intent
 * into a real test means the banner is verified on every run, and the script can
 * be removed without losing anything.
 */
import { NestScrambleModule } from '../src/NestScrambleModule';
import { ScrambleLogger } from '../src/utils/ScrambleLogger';

/** Strips ANSI colour codes so assertions read cleanly. */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Renders the banner for a set of options.
 *
 * `displayDashboard()` is private and runs from `onModuleInit()`, which is the
 * seam used here rather than reaching into internals.
 */
function renderBanner(options: Record<string, unknown>): string {
  const captured: string[] = [];

  const spies = [
    jest.spyOn(process.stdout, 'write').mockImplementation((chunk: any) => {
      captured.push(String(chunk));
      return true;
    }),
    jest.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      captured.push(args.map(String).join(' '));
    }),
  ];

  try {
    // `moduleOptions` is normally populated by `forRoot()`; the constructor
    // mirrors it so a banner can be rendered without booting an application.
    const module = new NestScrambleModule(options as any);
    module.onModuleInit();
  } finally {
    spies.forEach(spy => spy.mockRestore());
  }

  return stripAnsi(captured.join('\n'));
}

const BASE_OPTIONS = {
  baseUrl: 'http://127.0.0.1:4444',
  path: 'docs',
  sourcePath: 'src',
  enableMock: true,
  theme: 'futuristic',
};

describe('startup banner', () => {
  afterEach(() => {
    ScrambleLogger.configure('info');
  });

  describe('uses the configured baseUrl', () => {
    let banner: string;

    beforeAll(() => {
      ScrambleLogger.configure('info');
      banner = renderBanner(BASE_OPTIONS);
    });

    it('prints the documentation URL', () => {
      expect(banner).toContain('http://127.0.0.1:4444/docs');
    });

    it('prints the spec URL', () => {
      expect(banner).toContain('http://127.0.0.1:4444/docs-json');
    });

    it('prints the mock URL', () => {
      expect(banner).toContain('http://127.0.0.1:4444/scramble-mock');
    });

    it('does not fall back to a hard-coded localhost:3000', () => {
      // The original bug: the banner ignored `baseUrl` entirely.
      expect(banner).not.toContain('localhost:3000');
    });
  });

  it('reports the configured source path', () => {
    ScrambleLogger.configure('info');
    const banner = renderBanner({ ...BASE_OPTIONS, sourcePath: 'apps/api/src' });

    expect(banner).toContain('apps/api/src');
  });

  it('omits the mock line when the mock is disabled', () => {
    ScrambleLogger.configure('info');
    const banner = renderBanner({ ...BASE_OPTIONS, enableMock: false });

    expect(banner).not.toContain('scramble-mock');
    expect(banner).toContain('/docs');
  });

  it('reports the configured theme', () => {
    ScrambleLogger.configure('info');

    expect(renderBanner({ ...BASE_OPTIONS, theme: 'classic' })).toContain('Classic');
    expect(renderBanner({ ...BASE_OPTIONS, theme: 'futuristic' })).toContain('Futuristic');
  });

  it('prints nothing at logLevel silent', () => {
    ScrambleLogger.configure('silent');
    expect(renderBanner(BASE_OPTIONS)).toBe('');
  });

  it('prints nothing at logLevel warn', () => {
    // The banner is informational, so anything above `info` suppresses it.
    ScrambleLogger.configure('warn');
    expect(renderBanner(BASE_OPTIONS)).toBe('');
  });
});
