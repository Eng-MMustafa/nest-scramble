import {
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

describe('renderDocsPage (built-in UI, default)', () => {
  it('fetches the OpenAPI document from the given spec URL', () => {
    const html = renderDocsPage({ specUrl: '/api/reference-json' });
    expect(html).toContain("SPEC_URL = '/api/reference-json'");
  });

  it('is fully self-contained: no CDN, no external fonts, no external scripts', () => {
    const html = renderDocsPage({ specUrl: '/docs-json' });
    // Nothing on the page loads from the network: no script/style/font tags
    // pointing anywhere, and no CSS imports.
    expect(html).not.toContain('<script src');
    expect(html).not.toContain('<link href');
    expect(html).not.toContain('<link rel="stylesheet"');
    expect(html).not.toContain('@import');
    expect(html).not.toContain('fonts.googleapis.com');
    expect(html).not.toContain('cdn.');
  });

  it('starts dark for the futuristic theme', () => {
    const html = renderDocsPage({ specUrl: '/docs-json', theme: 'futuristic' });
    expect(html).toContain('data-theme="dark"');
  });

  it('starts light for the classic theme', () => {
    const html = renderDocsPage({ specUrl: '/docs-json', theme: 'classic' });
    expect(html).toContain('data-theme="light"');
  });

  it('defaults to the futuristic theme', () => {
    const html = renderDocsPage({ specUrl: '/docs-json' });
    expect(html).toContain('data-theme="dark"');
  });

  it('supports switching themes at runtime', () => {
    const html = renderDocsPage({ specUrl: '/docs-json' });
    expect(html).toContain('theme-toggle');
    expect(html).toContain("[data-theme='light']");
    expect(html).toContain("[data-theme='dark']");
  });

  it('applies the primary colour to the accent CSS variable', () => {
    const html = renderDocsPage({ specUrl: '/docs-json', primaryColor: '#a855f7' });
    expect(html).toContain('--accent: #a855f7;');
  });

  it('falls back to the default colour for malformed input', () => {
    const html = renderDocsPage({ specUrl: '/docs-json', primaryColor: 'javascript:alert(1)' });
    expect(html).toContain('--accent: #00f2ff;');
    expect(html).not.toContain('javascript:alert(1)');
  });

  it('includes the request builder (Send button, tabs) and search', () => {
    const html = renderDocsPage({ specUrl: '/docs-json' });
    expect(html).toContain('id="send-btn"');
    expect(html).toContain('data-tab="params"');
    expect(html).toContain('data-tab="headers"');
    expect(html).toContain('data-tab="body"');
    expect(html).toContain('id="search"');
  });
});

describe('renderDocsPage (Scalar opt-in)', () => {
  it('hosts the Scalar bundle only when scalarUrl is set', () => {
    const html = renderDocsPage({
      specUrl: '/docs-json',
      scalarUrl: '/assets/scalar.js',
    });
    expect(html).toContain('src="/assets/scalar.js"');
    expect(html).toContain('data-url="/docs-json"');
  });

  it('does not load fonts from a CDN even on the Scalar page', () => {
    const html = renderDocsPage({
      specUrl: '/docs-json',
      scalarUrl: '/assets/scalar.js',
    });
    expect(html).not.toContain('fonts.googleapis.com');
    expect(html).not.toContain('fonts.gstatic.com');
  });

  it('enables dark mode for the futuristic theme', () => {
    const html = renderDocsPage({
      specUrl: '/docs-json',
      theme: 'futuristic',
      scalarUrl: '/assets/scalar.js',
    });
    expect(html).toContain('&quot;darkMode&quot;:true');
  });

  it('disables dark mode for the classic theme', () => {
    const html = renderDocsPage({
      specUrl: '/docs-json',
      theme: 'classic',
      scalarUrl: '/assets/scalar.js',
    });
    expect(html).toContain('&quot;darkMode&quot;:false');
  });

  it('applies the primary colour to the Scalar accent variables', () => {
    const html = renderDocsPage({
      specUrl: '/docs-json',
      primaryColor: '#a855f7',
      scalarUrl: '/assets/scalar.js',
    });
    expect(html).toContain('--scalar-color-accent: #a855f7;');
  });
});

describe('renderDocsPage (shared behaviour)', () => {

  it('renders a favicon link when one is configured', () => {
    const html = renderDocsPage({ specUrl: '/docs-json', faviconUrl: '/logo.png' });
    expect(html).toContain('<link rel="icon" href="/logo.png" />');
  });

  it('renders the favicon on the Scalar page too', () => {
    const html = renderDocsPage({
      specUrl: '/docs-json',
      faviconUrl: '/logo.png',
      scalarUrl: '/assets/scalar.js',
    });
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
