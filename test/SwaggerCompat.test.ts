/**
 * Verifies that `@nestjs/swagger` decorators are read as documentation hints
 * when present, without requiring the package to be installed at runtime.
 */
import { ControllerInfo, ScannerService } from '../src/scanner/ScannerService';
import { OpenApiTransformer } from '../src/utils/OpenApiTransformer';
import { ScrambleLogger } from '../src/utils/ScrambleLogger';

const FIXTURE_SOURCE = 'test/fixtures/swagger-compat';

describe('@nestjs/swagger decorator compatibility', () => {
  jest.setTimeout(120_000);

  let controller: ControllerInfo;

  beforeAll(() => {
    ScrambleLogger.configure('silent');
    const controllers = new ScannerService().scanControllers(FIXTURE_SOURCE);
    const found = controllers.find((c) => c.name === 'UsersController');
    if (!found) throw new Error('UsersController fixture was not discovered');
    controller = found;
  });

  afterAll(() => {
    ScrambleLogger.configure('info');
  });

  it('reads @ApiTags on a controller', () => {
    expect(controller.tags).toEqual(['User Management', 'Administration']);
  });

  it('reads @ApiOperation summary and description on a method', () => {
    const list = controller.methods.find((m) => m.name === 'list');
    expect(list?.summary).toBe('List all users');
    expect(list?.description).toBe('Returns a paginated list of users.');
  });

  it('emits tags, summaries and examples in the OpenAPI spec', () => {
    const spec = new OpenApiTransformer('http://localhost:3000', '').transform(
      [controller],
      'Test API',
      '1.0.0',
      'http://localhost:3000',
    );

    const operation = spec.paths['/users'].get;
    expect(operation.tags).toEqual(['User Management', 'Administration']);
    expect(operation.summary).toBe('List all users');
    expect(operation.description).toBe('Returns a paginated list of users.');

    const create = spec.paths['/users'].post;
    const bodySchemaRef = create.requestBody.content['application/json'].schema;
    expect(bodySchemaRef.$ref).toMatch(/CreateUserDto$/);
    const bodySchema = spec.components.schemas[Object.keys(spec.components.schemas).find((k) => k.endsWith('CreateUserDto'))!];
    expect(bodySchema.properties.name.description).toBe('Full name of the user');
    expect(bodySchema.properties.name.example).toBe('John Doe');
    expect(bodySchema.properties.role.enum).toEqual(['admin', 'user']);
    expect(bodySchema.properties.age.example).toBe(25);
  });
});
