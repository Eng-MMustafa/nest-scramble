/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import { formatApiChangelog } from '../src/diff/ApiChangelog';
import { diffSpecs } from '../src/diff/SpecDiff';

function spec(paths: Record<string, any>): any {
  return {
    openapi: '3.0.0',
    info: { title: 'API', version: '1.0.0' },
    paths,
    components: { schemas: {} },
  };
}

const okResponse = { '200': { description: 'OK' } };

describe('formatApiChangelog', () => {
  it('reports when nothing changed', () => {
    const s = spec({ '/users': { get: { responses: okResponse } } });
    const result = diffSpecs(s, s);
    const output = formatApiChangelog(result, { fromLabel: 'v1', toLabel: 'v2' });

    expect(output).toContain('v1 → v2');
    expect(output).toContain('No API changes detected.');
  });

  it('groups breaking, removed and added changes', () => {
    const base = spec({
      '/users': { get: { responses: okResponse } },
      '/legacy': { get: { responses: okResponse } },
    });
    const head = spec({
      '/users': { get: { responses: okResponse } },
      '/orders': { post: { responses: okResponse } },
    });

    const output = formatApiChangelog(diffSpecs(base, head), { fromLabel: 'v1', toLabel: 'v2' });

    expect(output).toContain('⚠ Breaking Changes');
    expect(output).toContain('/legacy: removed');
    expect(output).toContain('### Added');
    expect(output).toContain('/orders: added');
    expect(output).toContain('**1 breaking**');
  });

  it('includes the date in the heading', () => {
    const s = spec({ '/a': { get: { responses: okResponse } } });
    const output = formatApiChangelog(diffSpecs(s, s), {
      fromLabel: 'v1',
      toLabel: 'v2',
      date: '2026-08-26',
    });

    expect(output).toContain('_2026-08-26_');
  });
});
