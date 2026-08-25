import {
  DEFAULT_SCALAR_URL,
  escapeHtml,
  renderDocsPage,
  sanitizeHexColor,
} from '../src/utils/DocsPageRenderer';

describe('escapeHtml', () => {
  it('escapes characters that could break out of an attribute or tag', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    expect(escapeHtml('a"b')).toBe('a&quot;b');
    expect(escapeHtml("a'b")).toBe('a&#39;b');
    expect(escapeHtml('a&b')).toBe('a&amp;b');
  });

  it('escapes the ampersand first so entities are not double-encoded incorrectly', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });
});

describe('sanitizeHexColor', () => {
  it('accepts 3- and 6-digit hex colours', () => {
    expect(sanitizeHexColor('#fff')).toBe('#fff');
    expect(sanitizeHexColor('#00f2ff')).toBe('#00f2ff');
    expect(sanitizeHexColor('#A855F7')).toBe('#A855F7');
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizeHexColor('  #123456  ')).toBe('#123456');
  });

  it('rejects values that are not hex colours', () => {
    expect(sanitizeHexColor('red')).toBe('#00f2ff');
    expect(sanitizeHexColor('#12345')).toBe('#00f2ff');
    expect(sanitizeHexColor('')).toBe('#00f2ff');
    expect(sanitizeHexColor(undefined)).toBe('#00f2ff');
  });

  it('rejects CSS injection attempts', () => {
    expect(sanitizeHexColor('#fff; } body { display:none')).toBe('#00f2ff');
  });

  it('honours a custom fallback', () => {
    expect(sanitizeHexColor('nope', '#000000')).toBe('#000000');
  });
});

describe('renderDocsPage', () => {
  it('points the Scalar mount at the given spec URL', () => {
    const html = renderDocsPage({ specUrl: '/api/reference-json' });
    expect(html).toContain('data-url="/api/reference-json"');
  });

  it('pins the Scalar bundle to a major version by default', () => {
    const html = renderDocsPage({ specUrl: '/docs-json' });
    expect(html).toContain(DEFAULT_SCALAR_URL);
    // An unpinned URL lets an upstream breaking release break every consumer.
    expect(html).not.toContain('@scalar/api-reference"');
  });

  it('allows self-hosting the Scalar bundle for air-gapped setups', () => {
    const html = renderDocsPage({
      specUrl: '/docs-json',
      scalarUrl: '/assets/scalar.js',
    });
    expect(html).toContain('src="/assets/scalar.js"');
    expect(html).not.toContain('cdn.jsdelivr.net');
  });

  it('enables dark mode for the futuristic theme', () => {
    const html = renderDocsPage({ specUrl: '/docs-json', theme: 'futuristic' });
    expect(html).toContain('&quot;darkMode&quot;:true');
  });

  it('disables dark mode for the classic theme', () => {
    const html = renderDocsPage({ specUrl: '/docs-json', theme: 'classic' });
    expect(html).toContain('&quot;darkMode&quot;:false');
  });

  it('defaults to the futuristic theme', () => {
    const html = renderDocsPage({ specUrl: '/docs-json' });
    expect(html).toContain('&quot;darkMode&quot;:true');
  });

  it('applies the primary colour to the accent CSS variables', () => {
    const html = renderDocsPage({ specUrl: '/docs-json', primaryColor: '#a855f7' });
    expect(html).toContain('--scalar-color-accent: #a855f7;');
  });

  it('falls back to the default colour for malformed input', () => {
    const html = renderDocsPage({ specUrl: '/docs-json', primaryColor: 'javascript:alert(1)' });
    expect(html).toContain('--scalar-color-accent: #00f2ff;');
    expect(html).not.toContain('javascript:alert(1)');
  });

  it('renders a favicon link when one is configured', () => {
    const html = renderDocsPage({ specUrl: '/docs-json', faviconUrl: '/logo.png' });
    expect(html).toContain('<link rel="icon" href="/logo.png" />');
  });

  it('omits the favicon link when none is configured', () => {
    const html = renderDocsPage({ specUrl: '/docs-json' });
    expect(html).not.toContain('rel="icon"');
  });

  it('uses the configured title', () => {
    const html = renderDocsPage({ specUrl: '/docs-json', title: 'Billing API' });
    expect(html).toContain('<title>Billing API</title>');
  });

  it('escapes the title so it cannot inject markup', () => {
    const html = renderDocsPage({ specUrl: '/docs-json', title: '</title><script>x()</script>' });
    expect(html).not.toContain('<script>x()</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('produces a complete HTML document', () => {
    const html = renderDocsPage({ specUrl: '/docs-json' });
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html.trimEnd().endsWith('</html>')).toBe(true);
  });
});
