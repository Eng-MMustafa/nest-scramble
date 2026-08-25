/**
 * Tests for `class-validator` constraint extraction.
 *
 * v3.0.6 read only the TypeScript type, so the real API contract — expressed
 * almost entirely through these decorators in practice — was discarded. Generated
 * specs had no `format`, no bounds, and no patterns.
 */
import { PropertyInfo } from '../src/utils/DtoAnalyzer';
import { OpenApiTransformer } from '../src/utils/OpenApiTransformer';
import { ControllerInfo, ScannerService } from '../src/scanner/ScannerService';
import { ScrambleLogger } from '../src/utils/ScrambleLogger';

const FIXTURE_SOURCE = 'test/fixtures/validated-app';

describe('class-validator constraint extraction', () => {
  jest.setTimeout(120_000);

  let properties: PropertyInfo[];

  const prop = (name: string): PropertyInfo => {
    const found = properties.find((p) => p.name === name);
    if (!found) throw new Error(`Fixture property "${name}" not found`);
    return found;
  };

  beforeAll(() => {
    ScrambleLogger.configure('silent');
    const controllers = new ScannerService().scanControllers(FIXTURE_SOURCE);
    const accounts = controllers.find((c) => c.name === 'AccountsController')!;
    const create = accounts.methods.find((m) => m.name === 'createAccount')!;
    const body = create.parameters.find((p) => p.parameterLocation === 'body')!;
    properties = body.type.properties!;
  });

  afterAll(() => {
    ScrambleLogger.configure('info');
  });

  it('resolves the DTO properties at all', () => {
    expect(properties.length).toBeGreaterThan(10);
  });

  describe('formats', () => {
    it.each([
      ['email', 'email'],
      ['tenantId', 'uuid'],
      ['website', 'uri'],
      ['bornOn', 'date-time'],
    ])('maps %s to format %s', (name, format) => {
      expect(prop(name).validation?.format).toBe(format);
    });
  });

  describe('string constraints', () => {
    it('reads @MaxLength', () => {
      expect(prop('email').validation?.maxLength).toBe(255);
    });

    it('reads @MinLength', () => {
      expect(prop('password').validation?.minLength).toBe(8);
      expect(prop('password').validation?.maxLength).toBe(72);
    });

    it('reads both bounds from @Length', () => {
      expect(prop('displayName').validation?.minLength).toBe(2);
      expect(prop('displayName').validation?.maxLength).toBe(40);
    });

    it('reads @Matches as a pattern without regex delimiters', () => {
      expect(prop('handle').validation?.pattern).toBe('^[a-z0-9_]+$');
    });
  });

  describe('numeric constraints', () => {
    it('reads @Min and @Max', () => {
      expect(prop('age').validation?.minimum).toBe(18);
      expect(prop('age').validation?.maximum).toBe(120);
    });

    it('reads @IsInt', () => {
      expect(prop('age').validation?.isInteger).toBe(true);
    });

    it('reads @IsPositive as an exclusive lower bound', () => {
      expect(prop('creditBalance').validation?.exclusiveMinimum).toBe(0);
    });

    it('reads @IsNegative as an exclusive upper bound', () => {
      expect(prop('debtBalance').validation?.exclusiveMaximum).toBe(0);
    });

    it('reads @IsDivisibleBy as multipleOf', () => {
      expect(prop('quantity').validation?.multipleOf).toBe(5);
    });
  });

  describe('enum and array constraints', () => {
    it('reads @IsIn as an enum', () => {
      expect(prop('plan').validation?.enum).toEqual(['free', 'pro', 'enterprise']);
    });

    it('reads @ArrayMinSize and @ArrayMaxSize', () => {
      expect(prop('tags').validation?.minItems).toBe(1);
      expect(prop('tags').validation?.maxItems).toBe(10);
    });

    it('reads @ArrayUnique', () => {
      expect(prop('tags').validation?.uniqueItems).toBe(true);
    });
  });

  describe('requiredness overrides', () => {
    it('@IsOptional makes a non-nullable property optional', () => {
      // The validation pipe, not the TypeScript type, decides what is accepted.
      expect(prop('nickname').type.isOptional).toBe(true);
    });

    it('@IsNotEmpty makes an optional property required', () => {
      expect(prop('slug').type.isOptional).toBe(false);
      expect(prop('slug').validation?.minLength).toBe(1);
    });
  });

  it('leaves undecorated properties without constraints', () => {
    expect(prop('plainField').validation).toBeUndefined();
  });
});

describe('constraints in the OpenAPI document', () => {
  jest.setTimeout(120_000);

  let schema: any;

  beforeAll(() => {
    ScrambleLogger.configure('silent');
    const controllers: ControllerInfo[] = new ScannerService().scanControllers(FIXTURE_SOURCE);
    const spec = new OpenApiTransformer().transform(controllers);
    schema = spec.components.schemas['CreateAccountDto'];
  });

  afterAll(() => {
    ScrambleLogger.configure('info');
  });

  it('registers the DTO schema', () => {
    expect(schema).toBeDefined();
    expect(schema.type).toBe('object');
  });

  it('emits string formats', () => {
    expect(schema.properties.email.format).toBe('email');
    expect(schema.properties.tenantId.format).toBe('uuid');
  });

  it('emits length bounds', () => {
    expect(schema.properties.email.maxLength).toBe(255);
    expect(schema.properties.password.minLength).toBe(8);
  });

  it('emits numeric bounds', () => {
    expect(schema.properties.age.minimum).toBe(18);
    expect(schema.properties.age.maximum).toBe(120);
  });

  it('emits integer as its own JSON Schema type', () => {
    expect(schema.properties.age.type).toBe('integer');
  });

  it('emits patterns', () => {
    expect(schema.properties.handle.pattern).toBe('^[a-z0-9_]+$');
  });

  it('emits enums from @IsIn', () => {
    expect(schema.properties.plan.enum).toEqual(['free', 'pro', 'enterprise']);
  });

  it('emits array keywords on the array, not the item schema', () => {
    expect(schema.properties.tags.type).toBe('array');
    expect(schema.properties.tags.minItems).toBe(1);
    expect(schema.properties.tags.maxItems).toBe(10);
    expect(schema.properties.tags.uniqueItems).toBe(true);
    expect(schema.properties.tags.items.minItems).toBeUndefined();
  });

  it('respects @IsOptional in the required list', () => {
    expect(schema.required).not.toContain('nickname');
  });

  it('respects @IsNotEmpty in the required list', () => {
    expect(schema.required).toContain('slug');
  });
});
