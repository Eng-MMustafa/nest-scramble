/**
 * Tests for OpenAPI schema naming and the generated client's type naming.
 *
 * Two silent-corruption bugs are covered:
 *
 * 1. Generic DTO instantiations (`PaginatedDto<ProductDto>`, the standard
 *    pagination pattern) used the raw type text as the schema name. `<` and
 *    `>` are invalid in OpenAPI component names (`^[a-zA-Z0-9._-]+$`), so
 *    codegen tools rejected the document — and the typed client emitted
 *    `export interface PaginatedDto<ProductDto>`, which declares a type
 *    parameter named `ProductDto` instead of referencing the DTO.
 *
 * 2. Two DTOs sharing one name in different modules collided: the first won
 *    and every other same-named DTO was silently documented with the wrong
 *    shape.
 */
import { OpenApiTransformer } from '../src/utils/OpenApiTransformer';
import { TypedClientGenerator } from '../src/generators/TypedClientGenerator';
import { ControllerInfo, ScannerService } from '../src/scanner/ScannerService';
import { ScrambleLogger } from '../src/utils/ScrambleLogger';

const VALID_COMPONENT_NAME = /^[a-zA-Z0-9._-]+$/;

describe('schema and client type naming', () => {
  jest.setTimeout(120_000);

  let genericsControllers: ControllerInfo[];
  let collisionControllers: ControllerInfo[];

  beforeAll(() => {
    ScrambleLogger.configure('silent');
    const scanner = new ScannerService();
    genericsControllers = scanner.scanControllers('test/fixtures/generics-app');
    collisionControllers = scanner.scanControllers('test/fixtures/collision-app');
  });

  afterAll(() => {
    ScrambleLogger.configure('info');
  });

  describe('generic DTO instantiations in the OpenAPI document', () => {
    let spec: any;

    beforeAll(() => {
      spec = new OpenApiTransformer().transform(genericsControllers);
    });

    it('emits only spec-valid component names', () => {
      for (const name of Object.keys(spec.components.schemas)) {
        expect(name).toMatch(VALID_COMPONENT_NAME);
      }
    });

    it('names the instantiated generic schema and resolves its shape', () => {
      const schema = spec.components.schemas['PaginatedDtoOfProductDto'];
      expect(schema).toBeDefined();
      expect(Object.keys(schema.properties).sort()).toEqual(['items', 'page', 'total']);
    });

    it('points the items array at the element DTO schema', () => {
      const items = spec.components.schemas['PaginatedDtoOfProductDto'].properties.items;
      expect(items.type).toBe('array');
      expect(items.items.$ref).toBe('#/components/schemas/ProductDto');
      expect(spec.components.schemas['ProductDto']).toBeDefined();
    });

    it('references the sanitized name from the response', () => {
      const response = spec.paths['/catalog'].get.responses['200'];
      expect(response.content['application/json'].schema.$ref).toBe(
        '#/components/schemas/PaginatedDtoOfProductDto',
      );
    });
  });

  describe('same-named DTOs from different modules in the OpenAPI document', () => {
    let spec: any;

    beforeAll(() => {
      spec = new OpenApiTransformer().transform(collisionControllers);
    });

    it('keeps both shapes under distinct names', () => {
      const names = Object.keys(spec.components.schemas).filter((n) => n.startsWith('StatusDto'));
      expect(names).toHaveLength(2);

      const shapes = names
        .map((n) => Object.keys(spec.components.schemas[n].properties).sort().join(','))
        .sort();
      expect(shapes).toEqual(['code,reason,retryable', 'state,updatedAt']);
    });

    it('points each endpoint at its own DTO shape', () => {
      const refOf = (p: string) =>
        spec.paths[p].get.responses['200'].content['application/json'].schema.$ref;

      const shippingSchema =
        spec.components.schemas[refOf('/shipping/status').split('/').pop()!];
      const billingSchema =
        spec.components.schemas[refOf('/billing/status').split('/').pop()!];

      expect(Object.keys(shippingSchema.properties).sort()).toEqual(['state', 'updatedAt']);
      expect(Object.keys(billingSchema.properties).sort()).toEqual(['code', 'reason', 'retryable']);
    });
  });

  describe('typed client output', () => {
    it('emits a legal interface name for the instantiated generic', () => {
      const output = new TypedClientGenerator().generate(genericsControllers, 'API');
      expect(output).toContain('export interface PaginatedDtoOfProductDto {');
      expect(output).not.toContain('interface PaginatedDto<ProductDto>');
      expect(output).toContain('Promise<PaginatedDtoOfProductDto>');
    });

    it('emits both same-named DTOs as distinct interfaces', () => {
      const output = new TypedClientGenerator().generate(collisionControllers, 'API');
      const interfaces = output.match(/export interface (StatusDto\d*) \{/g) ?? [];
      expect(interfaces).toHaveLength(2);
    });

    it('references each distinct interface from its own client method', () => {
      const output = new TypedClientGenerator().generate(collisionControllers, 'API');

      const shippingClass = output.slice(output.indexOf('class ShippingControllerClient'));
      const billingClass = output.slice(output.indexOf('class BillingControllerClient'));

      const shippingReturn = shippingClass.match(/Promise<(StatusDto\d*)>/)?.[1];
      const billingReturn = billingClass.match(/Promise<(StatusDto\d*)>/)?.[1];

      expect(shippingReturn).toBeDefined();
      expect(billingReturn).toBeDefined();
      expect(shippingReturn).not.toBe(billingReturn);
    });
  });
});
