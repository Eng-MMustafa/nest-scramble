/**
 * Integration tests for the contract diff.
 *
 * These run the whole pipeline the way a CI job would: scan two versions of the
 * *source*, generate both documents, and compare them. This is the capability
 * that needs no running application, no database and no environment — the reason
 * the diff can execute on a pull request at all.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { diffSpecs } from '../src/diff/SpecDiff';
import { formatDiff } from '../src/diff/DiffFormatter';
import { ScannerService } from '../src/scanner/ScannerService';
import { OpenApiTransformer } from '../src/utils/OpenApiTransformer';
import { ScrambleLogger } from '../src/utils/ScrambleLogger';

/** Generates a document from a source directory, exactly as the CLI does. */
function specFromSource(sourcePath: string, globalPrefix = ''): Record<string, any> {
  const controllers = new ScannerService().scanControllers(sourcePath);
  return new OpenApiTransformer('http://localhost:3000', globalPrefix).transform(controllers);
}

const BASE_CONTROLLER = `
import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';

const dec = () => (_t: object, _k: string) => undefined;
export const IsEmail = dec;
export const IsOptional = dec;
export const MaxLength = (_n: number) => dec();
export const IsIn = (_v: unknown[]) => dec();

export class CreateOrderDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsIn(['free', 'pro'])
  plan!: string;

  @IsOptional()
  note!: string;
}

export class OrderDto {
  id!: string;
  email!: string;
  total!: number;
}

@Controller('orders')
export class OrdersController {
  @Get()
  list(): OrderDto[] {
    return [];
  }

  @Get(':id')
  findOne(@Param('id') id: string): OrderDto {
    return {} as OrderDto;
  }

  @Post()
  create(@Body() body: CreateOrderDto): OrderDto {
    return {} as OrderDto;
  }

  @Delete(':id')
  remove(@Param('id') id: string): OrderDto {
    return {} as OrderDto;
  }
}
`;

describe('diff integration (source to source)', () => {
  jest.setTimeout(240_000);

  let workDir: string;
  let baseDir: string;

  /** Writes a variant of the base controller and returns its directory. */
  function variant(name: string, transform: (source: string) => string): string {
    const dir = path.join(workDir, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'orders.controller.ts'), transform(BASE_CONTROLLER));
    return dir;
  }

  beforeAll(() => {
    ScrambleLogger.configure('silent');
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scramble-diff-'));
    baseDir = variant('base', source => source);
  });

  afterAll(() => {
    ScrambleLogger.configure('info');
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  it('generates a usable document from source alone', () => {
    const document = specFromSource(baseDir);

    expect(document.paths['/orders']).toBeDefined();
    expect(document.paths['/orders/{id}']).toBeDefined();
    expect(document.components.schemas.CreateOrderDto).toBeDefined();
  });

  it('reports no changes between identical sources', () => {
    const identical = variant('identical', source => source);
    const result = diffSpecs(specFromSource(baseDir), specFromSource(identical));

    expect(result.changes).toEqual([]);
    expect(result.hasBreaking).toBe(false);
  });

  it('detects a tightened @MaxLength as breaking', () => {
    const tightened = variant('tightened', source => source.replace('@MaxLength(255)', '@MaxLength(120)'));
    const result = diffSpecs(specFromSource(baseDir), specFromSource(tightened));

    expect(result.hasBreaking).toBe(true);
    expect(result.breaking.some(c => c.kind === 'request.constraint.tightened')).toBe(true);
    expect(result.breaking[0].detail).toContain('255 → 120');
  });

  it('detects a new required field as breaking', () => {
    const added = variant('added-required', source =>
      source.replace('  @IsOptional()\n  note!: string;', '  currency!: string;\n\n  @IsOptional()\n  note!: string;'),
    );

    const result = diffSpecs(specFromSource(baseDir), specFromSource(added));

    expect(result.hasBreaking).toBe(true);
    expect(result.breaking.some(c => c.kind === 'request.property.added')).toBe(true);
  });

  it('detects a removed enum value as breaking', () => {
    const narrowed = variant('narrowed-enum', source => source.replace("@IsIn(['free', 'pro'])", "@IsIn(['pro'])"));
    const result = diffSpecs(specFromSource(baseDir), specFromSource(narrowed));

    expect(result.hasBreaking).toBe(true);
    expect(result.breaking.some(c => c.kind === 'request.enum.values.removed')).toBe(true);
  });

  it('detects a deleted endpoint as breaking', () => {
    const removed = variant('removed-endpoint', source =>
      source.replace(
        /  @Delete\(':id'\)\n  remove\(@Param\('id'\) id: string\): OrderDto \{\n    return \{\} as OrderDto;\n  \}\n/,
        '',
      ),
    );

    const result = diffSpecs(specFromSource(baseDir), specFromSource(removed));

    expect(result.hasBreaking).toBe(true);
    expect(result.breaking.some(c => c.kind === 'operation.removed' || c.kind === 'path.removed')).toBe(true);
  });

  it('detects a removed response field as breaking', () => {
    const trimmed = variant('trimmed-response', source => source.replace('  total!: number;\n', ''));
    const result = diffSpecs(specFromSource(baseDir), specFromSource(trimmed));

    expect(result.hasBreaking).toBe(true);
    expect(result.breaking.some(c => c.kind === 'response.property.removed')).toBe(true);
  });

  it('treats a new optional field as safe', () => {
    const extended = variant('added-optional', source =>
      source.replace(
        '  @IsOptional()\n  note!: string;',
        '  @IsOptional()\n  note!: string;\n\n  @IsOptional()\n  coupon!: string;',
      ),
    );

    const result = diffSpecs(specFromSource(baseDir), specFromSource(extended));

    expect(result.hasBreaking).toBe(false);
    expect(result.safe.some(c => c.kind === 'request.property.added')).toBe(true);
  });

  it('treats a new endpoint as safe', () => {
    const extended = variant('added-endpoint', source =>
      source.replace(
        '  @Post()',
        "  @Get('summary')\n  summary(): OrderDto {\n    return {} as OrderDto;\n  }\n\n  @Post()",
      ),
    );

    const result = diffSpecs(specFromSource(baseDir), specFromSource(extended));

    expect(result.hasBreaking).toBe(false);
    expect(result.safe.some(c => c.kind === 'path.added')).toBe(true);
  });

  it('treats a relaxed constraint as safe', () => {
    const relaxed = variant('relaxed', source => source.replace('@MaxLength(255)', '@MaxLength(500)'));
    const result = diffSpecs(specFromSource(baseDir), specFromSource(relaxed));

    expect(result.hasBreaking).toBe(false);
  });

  it('flags a global prefix change as a full contract break', () => {
    // Moving every route is exactly the kind of change a reviewer must see.
    const result = diffSpecs(specFromSource(baseDir), specFromSource(baseDir, 'api/v2'));

    expect(result.hasBreaking).toBe(true);
    expect(result.breaking.every(c => c.kind === 'path.removed')).toBe(true);
  });

  it('renders a reviewable report', () => {
    const tightened = variant('report', source => source.replace('@MaxLength(255)', '@MaxLength(120)'));
    const report = formatDiff(diffSpecs(specFromSource(baseDir), specFromSource(tightened)), 'markdown');

    expect(report).toContain('### Breaking changes');
    expect(report).toContain('maxLength');
  });
});
