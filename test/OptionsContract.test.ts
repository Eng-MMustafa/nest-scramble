/**
 * Holds the configuration surface honest.
 *
 * Five options were accepted, type-checked and then never read. Nothing failed:
 * the caller set one, saw no effect, and had no way to discover why. Normal
 * tests cannot catch that, because there is no behaviour to assert on — the
 * defect *is* the absence of behaviour. So this suite asserts a structural
 * property instead: every option must either be consumed somewhere in `src/`
 * or be declared ignored on purpose.
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestScrambleModule, NestScrambleOptions } from '../src/NestScrambleModule';
import { ScrambleLogger } from '../src/utils/ScrambleLogger';

const SRC = path.resolve(__dirname, '../src');
const MODULE_FILE = path.join(SRC, 'NestScrambleModule.ts');

/** Every `.ts` file under `src/`, keyed by path. */
function sourceFiles(): Map<string, string> {
  const found = new Map<string, string>();

  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts')) found.set(full, fs.readFileSync(full, 'utf-8'));
    }
  };

  walk(SRC);
  return found;
}

/** Option names taken from the interface declaration itself. */
function declaredOptions(): string[] {
  const body = fs.readFileSync(MODULE_FILE, 'utf-8');
  const start = body.indexOf('export interface NestScrambleOptions');
  expect(start).toBeGreaterThan(-1);

  const block = body.slice(start, body.indexOf('\n}', start));
  return [...block.matchAll(/^ {2}(\w+)\?:/gm)].map((match) => match[1]);
}

/**
 * Counts the places an option genuinely influences behaviour.
 *
 * Three kinds of mention look like a use but are not, and skipping them is the
 * whole point: the declaration itself, the entry in the ignored list, and the
 * `x: options.x || default` line that copies the value into the config object.
 * That last one is what made these options look wired up while nothing ever
 * read the result.
 */
function timesRead(option: string, files: Map<string, string>): number {
  const declaration = new RegExp(`^ {2}${option}\\?:`);
  const copyIntoConfig = new RegExp(`^\\s*${option}:\\s*options\\.${option}\\b`);
  const ignoredListEntry = new RegExp(`^\\s*\\['${option}',`);
  const reference = new RegExp(`\\b${option}\\b`);
  let count = 0;

  for (const [file, body] of files) {
    for (const line of body.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('*') || trimmed.startsWith('//')) continue;
      if (copyIntoConfig.test(line) || ignoredListEntry.test(line)) continue;
      if (file === MODULE_FILE && declaration.test(line)) continue;
      if (reference.test(line)) count++;
    }
  }

  return count;
}

describe('configuration contract', () => {
  const files = sourceFiles();
  const options = declaredOptions();
  const ignored = new Set<string>([...NestScrambleModule.IGNORED_OPTIONS.keys()] as string[]);

  it('finds the declared options', () => {
    // Guards the parsing above: a rename must not quietly empty this suite.
    expect(options.length).toBeGreaterThan(15);
    expect(options).toContain('sourcePath');
    expect(options).toContain('baseUrl');
  });

  it('reads every option that is not declared ignored', () => {
    const dead = options.filter((option) => !ignored.has(option) && timesRead(option, files) === 0);

    expect(dead).toEqual([]);
  });

  it('keeps the ignored list free of options that are in fact implemented', () => {
    // The opposite drift: an option gets wired up, but the warning keeps
    // telling users it does nothing.
    const stale = [...ignored].filter((option) => timesRead(option, files) > 0);

    expect(stale).toEqual([]);
  });

  it('only lists options that actually exist on the interface', () => {
    const unknown = [...ignored].filter((option) => !options.includes(option));

    expect(unknown).toEqual([]);
  });

  describe('warning on an ignored option', () => {
    let warnings: string[];
    let warnSpy: jest.SpyInstance;

    beforeEach(() => {
      warnings = [];
      warnSpy = jest
        .spyOn(ScrambleLogger, 'warn')
        .mockImplementation((message: string) => void warnings.push(message));
    });

    afterEach(() => warnSpy.mockRestore());

    it.each([...NestScrambleModule.IGNORED_OPTIONS.keys()])('warns when %s is set', (option) => {
      const value = option === 'watchDebounce' ? 500 : option === 'defaultAuthType' ? 'bearer' : true;

      NestScrambleModule.forRoot({ [option]: value } as NestScrambleOptions);

      expect(warnings.some((message) => message.includes(String(option)))).toBe(true);
    });

    it('names an alternative in every warning', () => {
      // A warning that only says "ignored" leaves the caller stuck.
      for (const [option, advice] of NestScrambleModule.IGNORED_OPTIONS) {
        expect(advice.length).toBeGreaterThan(10);
        expect(String(option)).not.toBe(advice);
      }
    });

    it('stays quiet when no ignored option is set', () => {
      NestScrambleModule.forRoot({ sourcePath: 'test/fixtures/sample-app' });

      const noise = warnings.filter((message) => message.includes('is not implemented'));
      expect(noise).toEqual([]);
    });
  });
});
