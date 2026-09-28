/**
 * Holds the configuration surface honest.
 *
 * An option that is declared but never read anywhere is worse than one that does
 * not exist: the caller sees no effect and has no way to discover why. Normal
 * tests cannot catch that, because there is no behaviour to assert on — the
 * defect *is* the absence of behaviour. So this suite asserts a structural
 * property: every option in `NestScrambleOptions` must influence behaviour
 * somewhere in `src/` (above and beyond copying its value into the internal
 * `config` object).
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestScrambleOptions } from '../src/NestScrambleModule';

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
 * Two kinds of mention look like a use but are not, and skipping them is the
 * whole point: the declaration itself and the `x: options.x || default` line
 * that copies the value into the config object. That last one is what made
 * previous dead options look wired up while nothing ever read the result.
 */
function timesRead(option: string, files: Map<string, string>): number {
  const declaration = new RegExp(`^ {2}${option}\\?:`);
  const copyIntoConfig = new RegExp(`^\\s*${option}:\\s*options\\.${option}\\b`);
  const reference = new RegExp(`\\b${option}\\b`);
  let count = 0;

  for (const [file, body] of files) {
    for (const line of body.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('*') || trimmed.startsWith('//')) continue;
      if (copyIntoConfig.test(line)) continue;
      if (file === MODULE_FILE && declaration.test(line)) continue;
      if (reference.test(line)) count++;
    }
  }

  return count;
}

describe('configuration contract', () => {
  const files = sourceFiles();
  const options = declaredOptions();

  it('finds the declared options', () => {
    // Guards the parsing above: a rename must not quietly empty this suite.
    expect(options.length).toBeGreaterThan(10);
    expect(options).toContain('sourcePath');
    expect(options).toContain('baseUrl');
  });

  it('reads every declared option somewhere in the source', () => {
    const dead = options.filter((option) => timesRead(option, files) === 0);
    expect(dead).toEqual([]);
  });

  it('keeps the TypeScript interface in sync with what callers can actually pass', () => {
    // This is a compile-time guard: if an option exists in the interface but is
    // not tested below, the type check will fail because `NestScrambleOptions`
    // expects every key to be present.
    const allKeys: (keyof NestScrambleOptions)[] = [
      'path',
      'enableDocs',
      'enableMock',
      'autoExportPostman',
      'postmanOutputPath',
      'baseUrl',
      'sourcePath',
      'apiTitle',
      'apiVersion',
      'customDomainIcon',
      'primaryColor',
      'theme',
      'useIncrementalScanning',
      'cacheFilePath',
      'hashAlgorithm',
      'cacheTtl',
      'skipDependencyTracking',
      'scalarUrl',
      'enableDriftDetection',
      'logLevel',
      'globalPrefix',
    ];
    const expected = new Set(allKeys);
    const actual = new Set(options);
    expect(actual).toEqual(expected);
  });
});
