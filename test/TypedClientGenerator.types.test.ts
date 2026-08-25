/**
 * Verifies the generated client is genuinely typed.
 *
 * v3.0.6 emitted `export interface UserDto { [key: string]: unknown; }` for
 * every DTO, so the advertised "fully typed" client accepted any property and
 * caught no mistakes. These tests pin the real behaviour.
 */
import * as ts from 'typescript';
import { TypedClientGenerator } from '../src/generators/TypedClientGenerator';
import { ScannerService } from '../src/scanner/ScannerService';
import { ScrambleLogger } from '../src/utils/ScrambleLogger';

const FIXTURE_SOURCE = 'test/fixtures/sample-app';

/** Type-checks a standalone source string and returns the diagnostics. */
function typeCheck(source: string): string[] {
  const fileName = 'generated-client.ts';
  const host = ts.createCompilerHost({});
  const originalGetSourceFile = host.getSourceFile.bind(host);

  host.getSourceFile = (name, languageVersion, ...rest) => {
    if (name === fileName) {
      return ts.createSourceFile(name, source, languageVersion, true);
    }
    return originalGetSourceFile(name, languageVersion, ...rest);
  };
  host.writeFile = () => undefined;

  const program = ts.createProgram([fileName], {
    strict: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2020,
    lib: ['lib.es2020.d.ts', 'lib.dom.d.ts'],
    skipLibCheck: true,
  }, host);

  return ts
    .getPreEmitDiagnostics(program)
    .filter((d) => d.file?.fileName === fileName)
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '));
}

describe('TypedClientGenerator — real types', () => {
  jest.setTimeout(120_000);

  let generated: string;

  beforeAll(() => {
    ScrambleLogger.configure('silent');
    const controllers = new ScannerService().scanControllers(FIXTURE_SOURCE);
    generated = new TypedClientGenerator('http://localhost:3000').generate(controllers, '3.1.0');
  });

  afterAll(() => {
    ScrambleLogger.configure('info');
  });

  it('does not emit index-signature stubs', () => {
    expect(generated).not.toContain('[key: string]: unknown');
  });

  it('emits a real interface with the DTO properties', () => {
    expect(generated).toContain('export interface UserDto {');
    expect(generated).toMatch(/id:\s*number;/);
    expect(generated).toMatch(/email:\s*string;/);
    expect(generated).toMatch(/fullName:\s*string;/);
    expect(generated).toMatch(/isActive:\s*boolean;/);
  });

  it('marks optional DTO properties as optional', () => {
    expect(generated).toMatch(/address\?:\s*AddressDto;/);
  });

  it('emits nested DTOs as their own interfaces', () => {
    expect(generated).toContain('export interface AddressDto {');
    expect(generated).toMatch(/street:\s*string;/);
    expect(generated).toMatch(/zip\?:\s*string;/);
  });

  it('emits enums as string literal unions', () => {
    expect(generated).toMatch(/export type UserRole = 'admin' \| 'member';/);
  });

  it('carries JSDoc descriptions into the generated types', () => {
    expect(generated).toContain('/** Primary contact email */');
  });

  it('types array properties as arrays', () => {
    expect(generated).toMatch(/tags:\s*string\[\];/);
  });

  it('emits a client class per controller plus an aggregate', () => {
    expect(generated).toContain('export class UsersControllerClient {');
    expect(generated).toContain('export class ApiClient {');
  });

  it('compiles cleanly under strict mode', () => {
    const errors = typeCheck(generated);
    expect(errors).toEqual([]);
  });

  it('rejects a misspelled property at compile time', () => {
    const errors = typeCheck(`${generated}

const user: UserDto = {
  id: 1,
  emial: 'typo@example.com',
  fullName: 'A',
  role: 'admin',
  tags: [],
  isActive: true,
};
`);

    // The whole point of a typed client: this must not compile.
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join(' ')).toContain('emial');
  });

  it('rejects a wrong property type at compile time', () => {
    const errors = typeCheck(`${generated}

const user: UserDto = {
  id: 'not-a-number',
  email: 'a@b.com',
  fullName: 'A',
  role: 'admin',
  tags: [],
  isActive: true,
};
`);

    expect(errors.length).toBeGreaterThan(0);
  });

  it('accepts a correctly shaped object', () => {
    const errors = typeCheck(`${generated}

const user: UserDto = {
  id: 1,
  email: 'a@b.com',
  fullName: 'A',
  role: 'member',
  tags: ['x'],
  isActive: true,
};
void user;
`);

    expect(errors).toEqual([]);
  });
});
