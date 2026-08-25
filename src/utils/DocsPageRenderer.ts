/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/

export type DocsTheme = 'classic' | 'futuristic';

export interface DocsPageOptions {
  /** URL the Scalar UI fetches the OpenAPI document from, e.g. `/docs-json` */
  specUrl: string;
  /** Browser tab title */
  title?: string;
  /** Accent colour, must be a hex value such as `#00f2ff` */
  primaryColor?: string;
  /** `futuristic` renders dark mode, `classic` renders light mode */
  theme?: DocsTheme;
  /** Optional favicon URL */
  faviconUrl?: string;
  /**
   * Full URL of the Scalar standalone bundle. Override this to self-host the
   * asset in air-gapped environments instead of relying on the public CDN.
   */
  scalarUrl?: string;
}

/**
 * Pinned to the v1 major line so a future breaking Scalar release cannot break
 * the docs page of every nest-scramble user without a nest-scramble release.
 * Override with `scalarUrl` to self-host.
 */
export const DEFAULT_SCALAR_URL = 'https://cdn.jsdelivr.net/npm/@scalar/api-reference@1';

const DEFAULT_PRIMARY_COLOR = '#00f2ff';

/**
 * Escapes a value for safe interpolation inside an HTML text node or a
 * double-quoted attribute.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Accepts only well-formed hex colours. Anything else falls back to the default
 * so a malformed config value cannot inject arbitrary CSS into the page.
 */
export function sanitizeHexColor(value: string | undefined, fallback = DEFAULT_PRIMARY_COLOR): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed) ? trimmed : fallback;
}

/**
 * Renders the standalone HTML page that hosts the Scalar API reference.
 *
 * Kept free of NestJS imports so it can be unit tested without a Nest context.
 */
export function renderDocsPage(options: DocsPageOptions): string {
  const theme: DocsTheme = options.theme === 'classic' ? 'classic' : 'futuristic';
  const primaryColor = sanitizeHexColor(options.primaryColor);
  const title = escapeHtml(options.title || 'API Documentation');
  const specUrl = escapeHtml(options.specUrl);
  const scalarUrl = escapeHtml(options.scalarUrl || DEFAULT_SCALAR_URL);

  const faviconTag = options.faviconUrl
    ? `\n  <link rel="icon" href="${escapeHtml(options.faviconUrl)}" />`
    : '';

  // Scalar reads its options from this attribute; `darkMode` is what actually
  // switches the rendered theme.
  const scalarConfig = escapeHtml(
    JSON.stringify({
      darkMode: theme === 'futuristic',
    }),
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <title>${title}</title>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />${faviconTag}
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
  <style>
    body {
      margin: 0;
      padding: 0;
      font-size: 17px;
      line-height: 1.6;
      letter-spacing: 0.1px;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Helvetica Neue', sans-serif;
    }
    :root {
      --scalar-font: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Helvetica Neue', sans-serif;
      --scalar-font-code: 'JetBrains Mono', 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
    }
    .light-mode {
      --scalar-color-1: #141824;
      --scalar-color-2: rgba(20, 24, 36, 0.7);
      --scalar-color-3: rgba(20, 24, 36, 0.55);
      --scalar-color-accent: ${primaryColor};
      --scalar-background-1: #ffffff;
      --scalar-background-2: #f5f7fb;
      --scalar-background-3: #eef2f8;
      --scalar-background-accent: ${primaryColor}12;
      --scalar-border-color: rgba(20, 24, 36, 0.08);
    }
    .dark-mode {
      --scalar-color-1: rgba(246, 249, 255, 0.94);
      --scalar-color-2: rgba(226, 235, 248, 0.76);
      --scalar-color-3: rgba(205, 219, 238, 0.6);
      --scalar-color-accent: ${primaryColor};
      --scalar-background-1: #1a2130;
      --scalar-background-2: #222b3a;
      --scalar-background-3: #2b3548;
      --scalar-background-accent: ${primaryColor}1a;
      --scalar-border-color: rgba(214, 226, 242, 0.12);
    }
    .scalar-api-reference nav,
    .scalar-api-reference aside,
    .scalar-api-reference .sidebar,
    .scalar-api-reference .toc,
    .scalar-api-reference .toc a,
    .scalar-api-reference .sidebar a {
      font-size: 1.05rem;
      letter-spacing: 0.2px;
    }
    .group\\/button-label {
      font-size: large;
      font-weight: 600;
      line-height: 1.4;
    }
  </style>
</head>
<body>
  <script id="api-reference" data-url="${specUrl}" data-configuration="${scalarConfig}"></script>
  <script src="${scalarUrl}"></script>
</body>
</html>`;
}
