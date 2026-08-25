/**
 * Tests for the contract diff.
 *
 * The value of this tool is entirely in the correctness of its verdicts: a
 * misclassified change is worse than no tool, because it either blocks a safe
 * release or waves through a broken one. Each rule is therefore asserted
 * explicitly, including the request/response asymmetry that a naive object diff
 * gets wrong.
 */
import { diffSpecs, SpecChange } from '../src/diff/SpecDiff';
import { formatDiff } from '../src/diff/DiffFormatter';

type Spec = Record<string, any>;

/** Builds a minimal single-operation document. */
function spec(operation: Record<string, any>, schemas: Record<string, any> = {}): Spec {
  return {
    openapi: '3.0.0',
    paths: { '/users': { post: operation } },
    components: { schemas },
  };
}

/** A request body wrapping the given JSON schema. */
function body(schema: Record<string, any>, required = true) {
  return { required, content: { 'application/json': { schema } } };
}

/** A 200 response wrapping the given JSON schema. */
function response200(schema: Record<string, any>) {
  return { '200': { description: 'OK', content: { 'application/json': { schema } } } };
}

const kinds = (changes: SpecChange[]) => changes.map(c => c.kind);

describe('diffSpecs', () => {
  describe('no changes', () => {
    it('reports nothing for identical documents', () => {
      const document = spec({ requestBody: body({ type: 'object', properties: { a: { type: 'string' } } }) });
      const result = diffSpecs(document, JSON.parse(JSON.stringify(document)));

      expect(result.changes).toEqual([]);
      expect(result.hasBreaking).toBe(false);
    });
  });

  describe('paths and operations', () => {
    it('flags a removed path as breaking', () => {
      const result = diffSpecs(spec({ responses: {} }), { openapi: '3.0.0', paths: {} });

      expect(result.hasBreaking).toBe(true);
      expect(kinds(result.breaking)).toContain('path.removed');
    });

    it('flags a removed operation as breaking', () => {
      const before = { openapi: '3.0.0', paths: { '/users': { get: { responses: {} }, post: { responses: {} } } } };
      const after = { openapi: '3.0.0', paths: { '/users': { get: { responses: {} } } } };

      expect(kinds(diffSpecs(before, after).breaking)).toContain('operation.removed');
    });

    it('treats a new path as safe', () => {
      const after = { openapi: '3.0.0', paths: { '/users': { post: { responses: {} } }, '/teams': { get: { responses: {} } } } };
      const result = diffSpecs(spec({ responses: {} }), after);

      expect(result.hasBreaking).toBe(false);
      expect(kinds(result.safe)).toContain('path.added');
    });

    it('treats a new operation on an existing path as safe', () => {
      const after = { openapi: '3.0.0', paths: { '/users': { post: { responses: {} }, get: { responses: {} } } } };
      const result = diffSpecs(spec({ responses: {} }), after);

      expect(result.hasBreaking).toBe(false);
      expect(kinds(result.safe)).toContain('operation.added');
    });
  });

  describe('request narrowing is breaking', () => {
    it('flags a new required field', () => {
      const before = spec({ requestBody: body({ type: 'object', properties: { a: { type: 'string' } }, required: ['a'] }) });
      const after = spec({
        requestBody: body({
          type: 'object',
          properties: { a: { type: 'string' }, currency: { type: 'string' } },
          required: ['a', 'currency'],
        }),
      });

      const result = diffSpecs(before, after);
      expect(result.hasBreaking).toBe(true);
      expect(kinds(result.breaking)).toContain('request.property.added');
    });

    it('treats a new optional field as safe', () => {
      const before = spec({ requestBody: body({ type: 'object', properties: { a: { type: 'string' } } }) });
      const after = spec({ requestBody: body({ type: 'object', properties: { a: { type: 'string' }, note: { type: 'string' } } }) });

      const result = diffSpecs(before, after);
      expect(result.hasBreaking).toBe(false);
      expect(kinds(result.safe)).toContain('request.property.added');
    });

    it('flags an optional field becoming required', () => {
      const shape = { type: 'object', properties: { a: { type: 'string' } } };
      const result = diffSpecs(spec({ requestBody: body(shape) }), spec({ requestBody: body({ ...shape, required: ['a'] }) }));

      expect(kinds(result.breaking)).toContain('request.property.required.added');
    });

    it('treats a required field becoming optional as safe', () => {
      const shape = { type: 'object', properties: { a: { type: 'string' } } };
      const result = diffSpecs(spec({ requestBody: body({ ...shape, required: ['a'] }) }), spec({ requestBody: body(shape) }));

      expect(result.hasBreaking).toBe(false);
    });

    it('flags a tightened maxLength', () => {
      const before = spec({ requestBody: body({ type: 'object', properties: { email: { type: 'string', maxLength: 255 } } }) });
      const after = spec({ requestBody: body({ type: 'object', properties: { email: { type: 'string', maxLength: 120 } } }) });

      const result = diffSpecs(before, after);
      expect(kinds(result.breaking)).toContain('request.constraint.tightened');
      expect(result.breaking[0].detail).toContain('255 → 120');
    });

    it('treats a relaxed maxLength as safe', () => {
      const before = spec({ requestBody: body({ type: 'object', properties: { email: { type: 'string', maxLength: 120 } } }) });
      const after = spec({ requestBody: body({ type: 'object', properties: { email: { type: 'string', maxLength: 255 } } }) });

      expect(diffSpecs(before, after).hasBreaking).toBe(false);
    });

    it('flags a raised minLength', () => {
      const before = spec({ requestBody: body({ type: 'object', properties: { p: { type: 'string', minLength: 6 } } }) });
      const after = spec({ requestBody: body({ type: 'object', properties: { p: { type: 'string', minLength: 12 } } }) });

      expect(kinds(diffSpecs(before, after).breaking)).toContain('request.constraint.tightened');
    });

    it('flags a raised minimum', () => {
      const before = spec({ requestBody: body({ type: 'object', properties: { age: { type: 'integer', minimum: 18 } } }) });
      const after = spec({ requestBody: body({ type: 'object', properties: { age: { type: 'integer', minimum: 21 } } }) });

      expect(kinds(diffSpecs(before, after).breaking)).toContain('request.constraint.tightened');
    });

    it('flags a lowered maximum', () => {
      const before = spec({ requestBody: body({ type: 'object', properties: { age: { type: 'integer', maximum: 120 } } }) });
      const after = spec({ requestBody: body({ type: 'object', properties: { age: { type: 'integer', maximum: 99 } } }) });

      expect(kinds(diffSpecs(before, after).breaking)).toContain('request.constraint.tightened');
    });

    it('flags a constraint appearing where none existed', () => {
      const before = spec({ requestBody: body({ type: 'object', properties: { n: { type: 'string' } } }) });
      const after = spec({ requestBody: body({ type: 'object', properties: { n: { type: 'string', maxLength: 10 } } }) });

      expect(kinds(diffSpecs(before, after).breaking)).toContain('request.constraint.added');
    });

    it('flags a newly added pattern', () => {
      const before = spec({ requestBody: body({ type: 'object', properties: { h: { type: 'string' } } }) });
      const after = spec({ requestBody: body({ type: 'object', properties: { h: { type: 'string', pattern: '^[a-z]+$' } } }) });

      expect(kinds(diffSpecs(before, after).breaking)).toContain('request.pattern.added');
    });

    it('flags removed enum values on a request', () => {
      const before = spec({ requestBody: body({ type: 'object', properties: { plan: { type: 'string', enum: ['free', 'pro'] } } }) });
      const after = spec({ requestBody: body({ type: 'object', properties: { plan: { type: 'string', enum: ['pro'] } } }) });

      const result = diffSpecs(before, after);
      expect(kinds(result.breaking)).toContain('request.enum.values.removed');
      expect(result.breaking[0].detail).toContain('no longer accepts');
    });

    it('treats added enum values on a request as safe', () => {
      const before = spec({ requestBody: body({ type: 'object', properties: { plan: { type: 'string', enum: ['free'] } } }) });
      const after = spec({ requestBody: body({ type: 'object', properties: { plan: { type: 'string', enum: ['free', 'pro'] } } }) });

      expect(diffSpecs(before, after).hasBreaking).toBe(false);
    });

    it('flags a request body becoming required', () => {
      const shape = { type: 'object', properties: { a: { type: 'string' } } };
      const result = diffSpecs(spec({ requestBody: body(shape, false) }), spec({ requestBody: body(shape, true) }));

      expect(kinds(result.breaking)).toContain('requestBody.required.added');
    });
  });

  describe('response narrowing is breaking', () => {
    it('flags a removed response field', () => {
      const before = spec({ responses: response200({ type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } }) });
      const after = spec({ responses: response200({ type: 'object', properties: { id: { type: 'string' } } }) });

      const result = diffSpecs(before, after);
      expect(result.hasBreaking).toBe(true);
      expect(kinds(result.breaking)).toContain('response.property.removed');
    });

    it('treats a new response field as safe', () => {
      const before = spec({ responses: response200({ type: 'object', properties: { id: { type: 'string' } } }) });
      const after = spec({ responses: response200({ type: 'object', properties: { id: { type: 'string' }, extra: { type: 'string' } } }) });

      expect(diffSpecs(before, after).hasBreaking).toBe(false);
    });

    it('flags a response field that is no longer guaranteed', () => {
      const shape = { type: 'object', properties: { id: { type: 'string' } } };
      const before = spec({ responses: response200({ ...shape, required: ['id'] }) });
      const after = spec({ responses: response200(shape) });

      expect(kinds(diffSpecs(before, after).breaking)).toContain('response.property.required.removed');
    });

    it('flags a removed status code', () => {
      const before = spec({ responses: { ...response200({ type: 'object' }), '404': { description: 'Not found' } } });
      const after = spec({ responses: response200({ type: 'object' }) });

      expect(kinds(diffSpecs(before, after).breaking)).toContain('response.removed');
    });

    it('treats a new status code as safe', () => {
      const before = spec({ responses: response200({ type: 'object' }) });
      const after = spec({ responses: { ...response200({ type: 'object' }), '429': { description: 'Too many requests' } } });

      expect(diffSpecs(before, after).hasBreaking).toBe(false);
    });

    it('warns about a new response enum value rather than failing', () => {
      const before = spec({ responses: response200({ type: 'object', properties: { s: { type: 'string', enum: ['a'] } } }) });
      const after = spec({ responses: response200({ type: 'object', properties: { s: { type: 'string', enum: ['a', 'b'] } } }) });

      const result = diffSpecs(before, after);
      expect(result.hasBreaking).toBe(false);
      expect(kinds(result.warnings)).toContain('response.enum.values.added');
    });

    it('does not treat a tightened response constraint as breaking', () => {
      // Narrowing what the server returns cannot reject a caller's input.
      const before = spec({ responses: response200({ type: 'object', properties: { s: { type: 'string', maxLength: 100 } } }) });
      const after = spec({ responses: response200({ type: 'object', properties: { s: { type: 'string', maxLength: 50 } } }) });

      expect(diffSpecs(before, after).hasBreaking).toBe(false);
    });
  });

  describe('asymmetry', () => {
    it('classifies the same structural edit differently per direction', () => {
      const wide = { type: 'object', properties: { a: { type: 'string' }, b: { type: 'string' } } };
      const narrow = { type: 'object', properties: { a: { type: 'string' } } };

      const requestSide = diffSpecs(spec({ requestBody: body(wide) }), spec({ requestBody: body(narrow) }));
      const responseSide = diffSpecs(spec({ responses: response200(wide) }), spec({ responses: response200(narrow) }));

      // Dropping a field the server reads only stops accepting it.
      expect(requestSide.hasBreaking).toBe(false);
      expect(kinds(requestSide.warnings)).toContain('request.property.removed');

      // Dropping a field the client reads breaks the client.
      expect(responseSide.hasBreaking).toBe(true);
      expect(kinds(responseSide.breaking)).toContain('response.property.removed');
    });
  });

  describe('parameters', () => {
    it('flags a new required parameter', () => {
      const before = spec({ responses: {}, parameters: [] });
      const after = spec({ responses: {}, parameters: [{ name: 'tenant', in: 'query', required: true, schema: { type: 'string' } }] });

      expect(kinds(diffSpecs(before, after).breaking)).toContain('parameter.added');
    });

    it('treats a new optional parameter as safe', () => {
      const before = spec({ responses: {}, parameters: [] });
      const after = spec({ responses: {}, parameters: [{ name: 'sort', in: 'query', required: false, schema: { type: 'string' } }] });

      const result = diffSpecs(before, after);
      expect(result.hasBreaking).toBe(false);
      expect(kinds(result.safe)).toContain('parameter.added');
    });

    it('flags an optional parameter becoming required', () => {
      const before = spec({ responses: {}, parameters: [{ name: 'q', in: 'query', required: false, schema: { type: 'string' } }] });
      const after = spec({ responses: {}, parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string' } }] });

      expect(kinds(diffSpecs(before, after).breaking)).toContain('parameter.required.added');
    });

    it('warns about a removed parameter', () => {
      const before = spec({ responses: {}, parameters: [{ name: 'q', in: 'query', required: false, schema: { type: 'string' } }] });
      const after = spec({ responses: {}, parameters: [] });

      const result = diffSpecs(before, after);
      expect(result.hasBreaking).toBe(false);
      expect(kinds(result.warnings)).toContain('parameter.removed');
    });

    it('distinguishes parameters by location, not just name', () => {
      const before = spec({ responses: {}, parameters: [{ name: 'id', in: 'query', required: true, schema: { type: 'string' } }] });
      const after = spec({ responses: {}, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }] });

      const result = diffSpecs(before, after);
      expect(kinds(result.breaking)).toContain('parameter.added');
      expect(kinds(result.warnings)).toContain('parameter.removed');
    });
  });

  describe('type and security', () => {
    it('flags a changed type', () => {
      const before = spec({ requestBody: body({ type: 'object', properties: { id: { type: 'string' } } }) });
      const after = spec({ requestBody: body({ type: 'object', properties: { id: { type: 'integer' } } }) });

      const result = diffSpecs(before, after);
      expect(kinds(result.breaking)).toContain('request.type.changed');
      expect(result.breaking[0].detail).toContain('string → integer');
    });

    it('flags an endpoint that starts requiring authentication', () => {
      const before = spec({ responses: {} });
      const after = spec({ responses: {}, security: [{ bearerAuth: [] }] });

      expect(kinds(diffSpecs(before, after).breaking)).toContain('security.added');
    });

    it('treats dropped authentication as safe', () => {
      const before = spec({ responses: {}, security: [{ bearerAuth: [] }] });
      const after = spec({ responses: {} });

      expect(diffSpecs(before, after).hasBreaking).toBe(false);
    });

    it('warns when an operation becomes deprecated', () => {
      const result = diffSpecs(spec({ responses: {} }), spec({ responses: {}, deprecated: true }));
      expect(kinds(result.warnings)).toContain('operation.deprecated');
    });
  });

  describe('$ref resolution', () => {
    it('sees through a $ref to compare the underlying schema', () => {
      const before = spec({ requestBody: body({ $ref: '#/components/schemas/CreateUser' }) }, {
        CreateUser: { type: 'object', properties: { email: { type: 'string', maxLength: 255 } } },
      });
      const after = spec({ requestBody: body({ $ref: '#/components/schemas/CreateUser' }) }, {
        CreateUser: { type: 'object', properties: { email: { type: 'string', maxLength: 120 } } },
      });

      const result = diffSpecs(before, after);
      expect(result.hasBreaking).toBe(true);
      expect(kinds(result.breaking)).toContain('request.constraint.tightened');
    });

    it('reports nothing when the referenced schema is unchanged', () => {
      const schemas = { CreateUser: { type: 'object', properties: { email: { type: 'string' } } } };
      const document = spec({ requestBody: body({ $ref: '#/components/schemas/CreateUser' }) }, schemas);

      expect(diffSpecs(document, JSON.parse(JSON.stringify(document))).changes).toEqual([]);
    });

    it('terminates on a circular $ref', () => {
      const schemas = {
        Node: { type: 'object', properties: { child: { $ref: '#/components/schemas/Node' } } },
      };
      const document = spec({ requestBody: body({ $ref: '#/components/schemas/Node' }) }, schemas);

      // A naive walker recurses forever here.
      expect(() => diffSpecs(document, JSON.parse(JSON.stringify(document)))).not.toThrow();
    });

    it('compares nested arrays of objects', () => {
      const before = spec({
        requestBody: body({ type: 'object', properties: { tags: { type: 'array', items: { type: 'string', maxLength: 20 } } } }),
      });
      const after = spec({
        requestBody: body({ type: 'object', properties: { tags: { type: 'array', items: { type: 'string', maxLength: 5 } } } }),
      });

      expect(diffSpecs(before, after).hasBreaking).toBe(true);
    });
  });

  describe('robustness', () => {
    it('handles documents with no paths', () => {
      expect(() => diffSpecs({}, {})).not.toThrow();
      expect(diffSpecs({}, {}).changes).toEqual([]);
    });

    it('handles a null baseline', () => {
      expect(() => diffSpecs(null as any, spec({ responses: {} }))).not.toThrow();
    });
  });
});

describe('formatDiff', () => {
  const before = spec({ requestBody: body({ type: 'object', properties: { email: { type: 'string', maxLength: 255 } } }) });
  const after = spec({ requestBody: body({ type: 'object', properties: { email: { type: 'string', maxLength: 120 } } }) });
  const result = diffSpecs(before, after);

  it('renders text with a marker and a summary', () => {
    const text = formatDiff(result, 'text');
    expect(text).toContain('BREAKING');
    expect(text).toContain('1 breaking');
  });

  it('states clearly when nothing changed', () => {
    const unchanged = diffSpecs(before, JSON.parse(JSON.stringify(before)));
    expect(formatDiff(unchanged, 'text')).toBe('No API changes detected.');
  });

  it('renders valid JSON carrying the verdict', () => {
    const parsed = JSON.parse(formatDiff(result, 'json'));
    expect(parsed.hasBreaking).toBe(true);
    expect(parsed.summary.breaking).toBe(1);
    expect(parsed.changes).toHaveLength(1);
  });

  it('renders markdown with headings', () => {
    const markdown = formatDiff(result, 'markdown');
    expect(markdown).toContain('## API diff');
    expect(markdown).toContain('### Breaking changes');
  });

  it('defaults to text', () => {
    expect(formatDiff(result)).toBe(formatDiff(result, 'text'));
  });
});
