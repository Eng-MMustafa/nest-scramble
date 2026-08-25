/**
 * Tests for `multipart/form-data` upload support.
 *
 * `@UploadedFile()` matched none of the parameter branches, so it was dropped
 * silently and an upload endpoint was documented with **no request body at all**
 * — impossible to call from the docs UI and invisible to the contract diff.
 *
 * The subtle part is the field name: it does not appear on `@UploadedFile()`,
 * which only takes pipes. It lives in the interceptor, so reading the parameter
 * alone would document a field name the server does not accept.
 */
import { PostmanCollectionGenerator } from '../src/generators/PostmanCollectionGenerator';
import { TypedClientGenerator } from '../src/generators/TypedClientGenerator';
import { ControllerInfo, MethodInfo, ScannerService } from '../src/scanner/ScannerService';
import { diffSpecs, SpecChange } from '../src/diff/SpecDiff';
import { OpenApiTransformer } from '../src/utils/OpenApiTransformer';
import { ScrambleLogger } from '../src/utils/ScrambleLogger';

const FIXTURE_SOURCE = 'test/fixtures/upload-app';

describe('file upload extraction', () => {
  jest.setTimeout(180_000);

  let media: ControllerInfo;

  const method = (name: string): MethodInfo => {
    const found = media.methods.find(m => m.name === name);
    if (!found) throw new Error(`Fixture method "${name}" not found`);
    return found;
  };

  beforeAll(() => {
    ScrambleLogger.configure('silent');
    const controllers = new ScannerService().scanControllers(FIXTURE_SOURCE);
    const found = controllers.find(c => c.name === 'MediaController');
    if (!found) throw new Error('MediaController fixture was not discovered');
    media = found;
  });

  afterAll(() => {
    ScrambleLogger.configure('info');
  });

  it('marks an @UploadedFile parameter as a file', () => {
    const param = method('uploadAvatar').parameters[0];
    expect(param.parameterLocation).toBe('file');
  });

  describe('field names come from the interceptor', () => {
    it('reads FileInterceptor', () => {
      expect(method('uploadAvatar').fileFields).toEqual([{ name: 'avatar', multiple: false }]);
    });

    it('reads FilesInterceptor with its maxCount', () => {
      expect(method('uploadGallery').fileFields).toEqual([
        { name: 'photos', multiple: true, maxCount: 10 },
      ]);
    });

    it('reads every entry of FileFieldsInterceptor', () => {
      expect(method('uploadMixed').fileFields).toEqual([
        { name: 'cover', multiple: false, maxCount: 1 },
        { name: 'attachments', multiple: true, maxCount: 5 },
      ]);
    });

    it('describes AnyFilesInterceptor as a generic array', () => {
      expect(method('uploadAny').fileFields).toEqual([{ name: 'files', multiple: true }]);
    });
  });

  describe('fallbacks', () => {
    it('still documents a field when no interceptor is recognised', () => {
      // Better a generic field than an endpoint documented with no body.
      expect(method('uploadWithoutInterceptor').fileFields).toEqual([
        { name: 'file', multiple: false },
      ]);
    });

    it('leaves non-upload routes untouched', () => {
      expect(method('createFromUrl').fileFields).toBeUndefined();
    });
  });

  it('keeps the @Body parameter alongside the file', () => {
    const params = method('uploadWithMeta').parameters;
    expect(params.find(p => p.parameterLocation === 'file')).toBeDefined();
    expect(params.find(p => p.parameterLocation === 'body')).toBeDefined();
  });
});

describe('uploads in the OpenAPI document', () => {
  jest.setTimeout(180_000);

  let spec: any;

  beforeAll(() => {
    ScrambleLogger.configure('silent');
    const controllers = new ScannerService().scanControllers(FIXTURE_SOURCE);
    spec = new OpenApiTransformer('http://localhost:3000').transform(controllers);
  });

  afterAll(() => {
    ScrambleLogger.configure('info');
  });

  const bodyOf = (path: string) => spec.paths[path]?.post?.requestBody;

  it('documents a request body for an upload route', () => {
    // This was entirely absent before.
    expect(bodyOf('/media/avatar')).toBeDefined();
  });

  it('uses the multipart content type', () => {
    expect(bodyOf('/media/avatar').content['multipart/form-data']).toBeDefined();
    expect(bodyOf('/media/avatar').content['application/json']).toBeUndefined();
  });

  it('describes a single file as a binary string', () => {
    const schema = bodyOf('/media/avatar').content['multipart/form-data'].schema;

    expect(schema.properties.avatar).toEqual({ type: 'string', format: 'binary' });
    expect(schema.required).toContain('avatar');
  });

  it('describes multiple files as an array of binaries with maxItems', () => {
    const schema = bodyOf('/media/gallery').content['multipart/form-data'].schema;

    expect(schema.properties.photos.type).toBe('array');
    expect(schema.properties.photos.items).toEqual({ type: 'string', format: 'binary' });
    expect(schema.properties.photos.maxItems).toBe(10);
  });

  it('describes each field of a multi-field upload', () => {
    const schema = bodyOf('/media/mixed').content['multipart/form-data'].schema;

    expect(schema.properties.cover).toEqual({ type: 'string', format: 'binary' });
    expect(schema.properties.attachments.type).toBe('array');
    expect(schema.properties.attachments.maxItems).toBe(5);
  });

  it('merges body fields into the multipart schema as siblings', () => {
    // In a multipart payload the metadata travels as form fields, not as JSON.
    const schema = bodyOf('/media/document').content['multipart/form-data'].schema;

    expect(schema.properties.document).toEqual({ type: 'string', format: 'binary' });
    expect(schema.properties.title).toBeDefined();
    expect(schema.properties.title.type).toBe('string');
    expect(schema.required).toEqual(expect.arrayContaining(['document', 'title']));
  });

  it('keeps optional body fields optional', () => {
    const schema = bodyOf('/media/document').content['multipart/form-data'].schema;

    expect(schema.properties.description).toBeDefined();
    expect(schema.required).not.toContain('description');
  });

  it('carries the JSDoc description of a merged body field', () => {
    const schema = bodyOf('/media/document').content['multipart/form-data'].schema;
    expect(schema.properties.title.description).toContain('gallery');
  });

  it('does not turn a JSON-only route into multipart', () => {
    const body = bodyOf('/media/json-only');

    expect(body.content['application/json']).toBeDefined();
    expect(body.content['multipart/form-data']).toBeUndefined();
  });

  it('does not emit the file parameter as a query or header parameter', () => {
    // The upload used to fall through every branch; make sure it is not now
    // mis-documented as a parameter instead.
    const operation = spec.paths['/media/avatar'].post;
    const parameterNames = (operation.parameters ?? []).map((p: any) => p.name);

    expect(parameterNames).not.toContain('file');
  });

  it('produces a document that still validates structurally', () => {
    expect(spec.openapi).toBe('3.0.0');
    expect(Object.keys(spec.paths).length).toBeGreaterThan(5);
  });

  describe('code samples in the docs UI', () => {
    /** Every sample used to send a JSON body regardless of the endpoint. */
    const samplesFor = (path: string): Record<string, string> => {
      const list = spec.paths[path].post['x-code-samples'] as { lang: string; source: string }[];
      return Object.fromEntries(list.map(s => [s.lang, s.source]));
    };

    it('shows a multipart curl for an upload', () => {
      const curl = samplesFor('/media/avatar').curl;

      expect(curl).toContain('-F "avatar=@/path/to/file"');
      expect(curl).not.toContain('application/json');
    });

    it('shows FormData in the JavaScript sample for an upload', () => {
      const js = samplesFor('/media/avatar').javascript;

      expect(js).toContain('new FormData()');
      expect(js).toContain("form.append('avatar'");
      // The browser must set the boundary itself.
      expect(js).not.toContain('Content-Type');
    });

    it('lists every field of a multi-field upload', () => {
      const curl = samplesFor('/media/mixed').curl;

      expect(curl).toContain('cover=@');
      expect(curl).toContain('attachments=@');
    });

    it('still shows a JSON body for a JSON endpoint', () => {
      expect(samplesFor('/media/json-only').curl).toContain('application/json');
    });
  });
});

describe('uploads reach every consumer of the request body', () => {
  /**
   * Adding multipart to the transformer alone would leave three downstream
   * consumers producing wrong output. Each is asserted here so an upload cannot
   * be half-supported.
   */
  jest.setTimeout(180_000);

  let controllers: ControllerInfo[];

  beforeAll(() => {
    ScrambleLogger.configure('silent');
    controllers = new ScannerService().scanControllers(FIXTURE_SOURCE);
  });

  afterAll(() => {
    ScrambleLogger.configure('info');
  });

  describe('typed client', () => {
    let client: string;

    beforeAll(() => {
      client = new TypedClientGenerator('http://localhost:3000').generate(controllers, '3.2.0');
    });

    it('builds FormData instead of a JSON body', () => {
      // A multipart endpoint rejects `JSON.stringify(...)`, so the previous
      // output produced a client that could never succeed.
      expect(client).toContain('new FormData()');
      expect(client).toContain("_form.append('avatar', avatar)");
    });

    it('types a single file as File', () => {
      expect(client).toContain('uploadAvatar(avatar: File)');
    });

    it('types a multi-file field as File[] and appends each entry', () => {
      expect(client).toContain('photos: File[]');
      expect(client).toContain("for (const _f of photos) _form.append('photos', _f)");
    });

    it('omits the Content-Type header so the boundary is generated', () => {
      const uploadBlock = client.slice(client.indexOf('async uploadAvatar'));
      const call = uploadBlock.slice(0, uploadBlock.indexOf('}'));

      expect(call).not.toContain('application/json');
    });

    it('appends merged metadata fields alongside the file', () => {
      expect(client).toContain('Object.entries(meta ?? {})');
    });

    it('still sends JSON for a non-upload route', () => {
      const jsonBlock = client.slice(client.indexOf('async createFromUrl'));
      expect(jsonBlock).toContain('JSON.stringify');
    });
  });

  describe('Postman collection', () => {
    let collection: any;

    beforeAll(() => {
      collection = new PostmanCollectionGenerator('http://localhost:3000').generateCollection(controllers);
    });

    /**
     * Finds a request by its controller method name. Items are labelled
     * `"<VERB> <methodName>"`, so the suffix is matched.
     */
    const requestNamed = (name: string): any => {
      for (const folder of collection.item) {
        const match = (folder.item ?? []).find((entry: any) => entry.name.endsWith(` ${name}`));
        if (match) return match.request;
      }
      throw new Error(`Postman request "${name}" not found`);
    };

    it('exports an upload as formdata, not raw JSON', () => {
      const request = requestNamed('uploadAvatar');

      expect(request.body.mode).toBe('formdata');
      expect(request.body.raw).toBeUndefined();
    });

    it('adds a file picker for each file field', () => {
      const fields = requestNamed('uploadAvatar').body.formdata;
      expect(fields).toEqual([{ key: 'avatar', type: 'file', src: [] }]);
    });

    it('drops the JSON Content-Type so Postman sets the boundary', () => {
      const headers = requestNamed('uploadAvatar').header.map((h: any) => h.key);
      expect(headers).not.toContain('Content-Type');
    });

    it('adds metadata as text fields beside the file', () => {
      const fields = requestNamed('uploadWithMeta').body.formdata;

      expect(fields.find((f: any) => f.key === 'document')?.type).toBe('file');
      expect(fields.find((f: any) => f.key === 'title')?.type).toBe('text');
    });

    it('keeps raw JSON for a non-upload route', () => {
      expect(requestNamed('createFromUrl').body.mode).toBe('raw');
    });
  });

  describe('contract diff', () => {
    const specOf = (list: ControllerInfo[]) => new OpenApiTransformer().transform(list);

    /** Deep-clones a document so it can be edited without touching the original. */
    const clone = (value: any) => JSON.parse(JSON.stringify(value));

    it('sees a removed file field at all', () => {
      // The diff read only `application/json`, so every multipart change was
      // completely invisible. Removing a *request* field stays a warning under
      // the asymmetric rules — the server merely stops accepting it — but it must
      // at least be reported.
      const before = specOf(controllers);
      const after = clone(before);
      delete after.paths['/media/mixed'].post.requestBody.content['multipart/form-data'].schema
        .properties.attachments;

      const result = diffSpecs(before, after);
      const reported = result.changes.filter((c: SpecChange) => c.location?.includes('attachments'));

      expect(reported.length).toBeGreaterThan(0);
      expect(reported[0].kind).toBe('request.property.removed');
      expect(reported[0].level).toBe('warning');
    });

    it('sees a newly required file field', () => {
      const before = specOf(controllers);
      const after = clone(before);
      const schema = after.paths['/media/document'].post.requestBody.content['multipart/form-data'].schema;
      schema.properties.watermark = { type: 'string', format: 'binary' };
      schema.required.push('watermark');

      const result = diffSpecs(before, after);

      expect(result.hasBreaking).toBe(true);
      expect(result.breaking.some(c => c.kind === 'request.property.added')).toBe(true);
    });

    it('flags a switch from JSON to multipart as breaking', () => {
      const before = specOf(controllers);
      const after = clone(before);
      const body = after.paths['/media/json-only'].post.requestBody;
      body.content = { 'multipart/form-data': body.content['application/json'] };

      const result = diffSpecs(before, after);

      expect(result.breaking.some(c => c.kind === 'requestBody.mediaType.changed')).toBe(true);
    });

    it('reports no change for an unmodified upload document', () => {
      const before = specOf(controllers);
      expect(diffSpecs(before, clone(before)).changes).toEqual([]);
    });
  });
});
