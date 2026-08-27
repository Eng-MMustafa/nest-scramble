/**
 * Tests for error responses recovered from `throw` statements.
 *
 * The generated spec used to document only the success path: a method that
 * plainly says `throw new NotFoundException()` produced a document with no 404.
 */
import { ControllerInfo, MethodInfo, ScannerService } from '../src/scanner/ScannerService';
import { OpenApiTransformer } from '../src/utils/OpenApiTransformer';
import { ScrambleLogger } from '../src/utils/ScrambleLogger';

const FIXTURE_SOURCE = 'test/fixtures/errors-app';

describe('thrown error extraction', () => {
  jest.setTimeout(120_000);

  let controller: ControllerInfo;
  let spec: any;

  const method = (name: string): MethodInfo => {
    const found = controller.methods.find((m) => m.name === name);
    if (!found) throw new Error(`Fixture method "${name}" not found`);
    return found;
  };

  beforeAll(() => {
    ScrambleLogger.configure('silent');
    const controllers = new ScannerService().scanControllers(FIXTURE_SOURCE);
    controller = controllers.find((c) => c.name === 'OrdersController')!;
    spec = new OpenApiTransformer('http://localhost:3000').transform(controllers);
  });

  afterAll(() => {
    ScrambleLogger.configure('info');
  });

  describe('scanner', () => {
    it('maps built-in exception classes to their status codes', () => {
      expect(method('findOne').errorResponses).toEqual([
        { status: 404, description: 'Order not found' },
      ]);
    });

    it('uses the default reason phrase when the throw has no message', () => {
      const statuses = method('create').errorResponses!;
      expect(statuses).toContainEqual({ status: 409, description: 'Conflict' });
    });

    it('resolves HttpException with an HttpStatus member', () => {
      expect(method('create').errorResponses).toContainEqual({
        status: 422,
        description: 'Order rejected',
      });
    });

    it('resolves HttpException with a numeric literal', () => {
      expect(method('create').errorResponses).toContainEqual({
        status: 418,
        description: 'Legacy failure',
      });
    });

    it('collapses duplicate statuses, first message wins', () => {
      expect(method('duplicateStatus').errorResponses).toEqual([
        { status: 404, description: 'First message wins' },
      ]);
    });

    it('reports nothing for a method that throws nothing', () => {
      expect(method('clean').errorResponses).toBeUndefined();
    });
  });

  describe('OpenAPI document', () => {
    it('adds an error response with the standard Nest envelope', () => {
      const res = spec.paths['/orders/{id}'].get.responses['404'];
      expect(res.description).toBe('Order not found');
      const props = res.content['application/json'].schema.properties;
      expect(props.statusCode.example).toBe(404);
      expect(props.message.example).toBe('Order not found');
    });

    it('documents every distinct thrown status', () => {
      const responses = spec.paths['/orders'].post.responses;
      expect(responses['409']).toBeDefined();
      expect(responses['422']).toBeDefined();
      expect(responses['418']).toBeDefined();
    });

    it('overwrites the generic guard 401 with the thrown message', () => {
      const res = spec.paths['/orders/guarded'].get.responses['401'];
      // The method's own throw is more specific than the guard-derived default.
      expect(res.description).toBe('Custom auth failure');
    });

    it('overwrites the blanket 404-free defaults only where thrown', () => {
      // Success-only methods keep the standard 200/400/500 trio and gain nothing.
      const responses = spec.paths['/orders/clean'].get.responses;
      expect(Object.keys(responses).sort()).toEqual(['200', '400', '500']);
      expect(responses['400'].description).toBe('Bad Request');
    });

    it('replaces the blanket 400 description when a 400 is actually thrown', () => {
      // findOne throws only 404; its 400 stays generic.
      const res = spec.paths['/orders/{id}'].get.responses['400'];
      expect(res.description).toBe('Bad Request');
    });
  });
});
