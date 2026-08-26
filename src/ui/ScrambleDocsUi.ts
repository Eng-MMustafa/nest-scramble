/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import { escapeHtml } from '../utils/DocsPageRenderer';

export interface ScrambleDocsUiOptions {
  /** URL the page fetches the OpenAPI document from, e.g. `/docs-json` */
  specUrl: string;
  /** Browser tab title */
  title: string;
  /** Sanitized hex accent colour */
  primaryColor: string;
  /** `dark` or `light` initial theme */
  initialTheme: 'dark' | 'light';
  /** Pre-rendered favicon link tag, or an empty string */
  faviconTag: string;
}

/**
 * Renders the built-in API reference page.
 *
 * The page is entirely self-contained: inline CSS, inline vanilla JS, system
 * fonts. Nothing is fetched from a CDN, so the docs work identically on an
 * air-gapped network, behind a corporate proxy, and offline. The OpenAPI
 * document is fetched client-side from `specUrl` — the same contract the
 * previous Scalar-based page used.
 */
export function renderScrambleDocsUi(options: ScrambleDocsUiOptions): string {
  const title = escapeHtml(options.title);
  const specUrl = escapeHtml(options.specUrl);
  const accent = options.primaryColor;

  return `<!DOCTYPE html>
<html lang="en" data-theme="${options.initialTheme}">
<head>
  <title>${title}</title>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />${options.faviconTag}
  <style>${buildCss(accent)}</style>
</head>
<body>
  <header class="topbar">
    <div class="brand">
      <span class="brand-dot"></span>
      <span class="brand-title" id="api-title">API Documentation</span>
      <span class="chip" id="api-version" hidden></span>
    </div>
    <div class="topbar-actions">
      <input type="search" id="search" class="search" placeholder="Filter endpoints…" autocomplete="off" />
      <a class="btn-ghost" id="spec-link" href="${specUrl}" target="_blank" rel="noopener">OpenAPI JSON</a>
      <button type="button" class="btn-ghost" id="theme-toggle" aria-label="Toggle theme">◐</button>
    </div>
  </header>
  <div class="layout">
    <nav class="sidebar" id="sidebar" aria-label="Endpoints"></nav>
    <main class="content" id="content">
      <div class="loading" id="loading">Loading specification…</div>
    </main>
  </div>
  <script>
  'use strict';
  (function () {
    var SPEC_URL = '${specUrl}';

    /* ------------------------------------------------------------------ *
     * Utilities
     * ------------------------------------------------------------------ */

    function esc(value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function el(html) {
      var t = document.createElement('template');
      t.innerHTML = html.trim();
      return t.content.firstElementChild;
    }

    /* ------------------------------------------------------------------ *
     * Theme
     * ------------------------------------------------------------------ */

    var root = document.documentElement;
    try {
      var saved = localStorage.getItem('scramble-theme');
      if (saved === 'dark' || saved === 'light') root.setAttribute('data-theme', saved);
    } catch (e) { /* storage may be unavailable */ }

    document.getElementById('theme-toggle').addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('scramble-theme', next); } catch (e) { /* ignore */ }
    });

    /* ------------------------------------------------------------------ *
     * Schema helpers ($ref resolution + example generation)
     * ------------------------------------------------------------------ */

    var spec = null;

    function resolveRef(schema, depth) {
      if (!schema || depth > 12) return schema || {};
      if (schema.$ref) {
        var parts = schema.$ref.replace('#/', '').split('/');
        var node = spec;
        for (var i = 0; i < parts.length && node; i++) node = node[parts[i]];
        return resolveRef(node || {}, depth + 1);
      }
      return schema;
    }

    function exampleOf(schema, depth) {
      schema = resolveRef(schema, 0);
      if (!schema || depth > 8) return null;
      if (schema.example !== undefined) return schema.example;
      if (schema.enum && schema.enum.length) return schema.enum[0];

      switch (schema.type) {
        case 'object': {
          var out = {};
          var props = schema.properties || {};
          Object.keys(props).forEach(function (key) {
            out[key] = exampleOf(props[key], depth + 1);
          });
          return out;
        }
        case 'array':
          return [exampleOf(schema.items || {}, depth + 1)];
        case 'integer':
        case 'number':
          if (schema.minimum !== undefined) return schema.minimum;
          return schema.type === 'integer' ? 1 : 1.5;
        case 'boolean':
          return true;
        case 'string':
          if (schema.format === 'date-time') return new Date().toISOString();
          if (schema.format === 'date') return new Date().toISOString().slice(0, 10);
          if (schema.format === 'email') return 'user@example.com';
          if (schema.format === 'uuid') return '00000000-0000-4000-8000-000000000000';
          if (schema.format === 'uri' || schema.format === 'url') return 'https://example.com';
          return 'string';
        default:
          if (schema.oneOf && schema.oneOf.length) return exampleOf(schema.oneOf[0], depth + 1);
          if (schema.anyOf && schema.anyOf.length) return exampleOf(schema.anyOf[0], depth + 1);
          if (schema.allOf && schema.allOf.length) return exampleOf(schema.allOf[0], depth + 1);
          if (schema.properties) { schema.type = 'object'; return exampleOf(schema, depth); }
          return null;
      }
    }

    function typeLabel(schema) {
      schema = resolveRef(schema, 0);
      if (!schema) return '';
      if (schema.type === 'array') return typeLabel(schema.items || {}) + '[]';
      if (schema.enum) return 'enum';
      if (schema.type) return schema.type + (schema.format ? ' (' + schema.format + ')' : '');
      if (schema.oneOf) return 'oneOf';
      if (schema.properties) return 'object';
      return '';
    }

    function constraintsLabel(schema) {
      schema = resolveRef(schema, 0);
      if (!schema) return '';
      var parts = [];
      if (schema.minLength !== undefined) parts.push('min ' + schema.minLength);
      if (schema.maxLength !== undefined) parts.push('max ' + schema.maxLength);
      if (schema.minimum !== undefined) parts.push('≥ ' + schema.minimum);
      if (schema.maximum !== undefined) parts.push('≤ ' + schema.maximum);
      if (schema.pattern) parts.push('pattern');
      if (schema.enum) parts.push(schema.enum.join(' | '));
      return parts.join(', ');
    }

    /** Renders a schema as an indented property tree. */
    function schemaTree(schema, depth) {
      schema = resolveRef(schema, 0);
      if (!schema || depth > 6) return '';
      if (schema.type === 'array') {
        return schemaTree(schema.items || {}, depth);
      }
      var props = schema.properties;
      if (!props) return '';
      var required = schema.required || [];
      var rows = Object.keys(props).map(function (name) {
        var p = resolveRef(props[name], 0);
        var isReq = required.indexOf(name) !== -1;
        var nested = (p.type === 'object' || (p.type === 'array' && resolveRef(p.items || {}, 0).properties) || p.properties)
          ? schemaTree(p, depth + 1) : '';
        var constraints = constraintsLabel(p);
        return '<div class="prop" style="--indent:' + depth + '">' +
          '<span class="prop-name">' + esc(name) + (isReq ? '<i class="req">*</i>' : '') + '</span>' +
          '<span class="prop-type">' + esc(typeLabel(p)) + '</span>' +
          (constraints ? '<span class="prop-constraints">' + esc(constraints) + '</span>' : '') +
          (p.description ? '<span class="prop-desc">' + esc(p.description) + '</span>' : '') +
          '</div>' + nested;
      });
      return rows.join('');
    }

    /* ------------------------------------------------------------------ *
     * Rendering
     * ------------------------------------------------------------------ */

    var METHOD_ORDER = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];

    function collectOperations() {
      var groups = {};
      Object.keys(spec.paths || {}).forEach(function (p) {
        METHOD_ORDER.forEach(function (m) {
          var op = spec.paths[p][m];
          if (!op) return;
          var tag = (op.tags && op.tags[0]) || p.split('/')[1] || 'default';
          (groups[tag] = groups[tag] || []).push({ path: p, method: m, op: op });
        });
      });
      return groups;
    }

    function highlightPath(p) {
      return esc(p).replace(/\\{([^}]+)\\}/g, '<span class="path-param">{$1}</span>');
    }

    function opId(method, p) {
      return 'op-' + method + '-' + p.replace(/[^a-zA-Z0-9]/g, '-');
    }

    function renderSidebar(groups) {
      var nav = document.getElementById('sidebar');
      nav.innerHTML = '';
      Object.keys(groups).sort().forEach(function (tag) {
        var section = el('<div class="nav-group"><div class="nav-tag">' + esc(tag) + '</div></div>');
        groups[tag].forEach(function (item) {
          var a = el('<a class="nav-item" href="#' + opId(item.method, item.path) + '">' +
            '<span class="method method-' + item.method + '">' + item.method.toUpperCase() + '</span>' +
            '<span class="nav-path">' + highlightPath(item.path) + '</span></a>');
          a.setAttribute('data-search', (item.method + ' ' + item.path + ' ' + (item.op.summary || '')).toLowerCase());
          section.appendChild(a);
        });
        nav.appendChild(section);
      });
    }

    function paramsTable(params) {
      if (!params || !params.length) return '';
      var rows = params.map(function (prm) {
        var schema = prm.schema || {};
        return '<tr>' +
          '<td class="mono">' + esc(prm.name) + (prm.required ? '<i class="req">*</i>' : '') + '</td>' +
          '<td><span class="chip chip-' + esc(prm.in) + '">' + esc(prm.in) + '</span></td>' +
          '<td class="mono dim">' + esc(typeLabel(schema)) + '</td>' +
          '<td class="dim">' + esc(prm.description || constraintsLabel(schema)) + '</td>' +
          '</tr>';
      }).join('');
      return '<h4>Parameters</h4><table class="params"><thead>' +
        '<tr><th>Name</th><th>In</th><th>Type</th><th>Description</th></tr>' +
        '</thead><tbody>' + rows + '</tbody></table>';
    }

    function bodySection(op) {
      var rb = op.requestBody;
      if (!rb || !rb.content) return { html: '', example: null, contentType: null };
      var ct = Object.keys(rb.content)[0];
      var schema = rb.content[ct].schema || {};
      var example = ct === 'application/json' ? exampleOf(schema, 0) : null;
      var tree = schemaTree(schema, 0);
      var html = '<h4>Request Body <span class="chip">' + esc(ct) + '</span></h4>' +
        (tree ? '<div class="schema">' + tree + '</div>' : '') +
        (example !== null
          ? '<pre class="code">' + esc(JSON.stringify(example, null, 2)) + '</pre>'
          : '');
      return { html: html, example: example, contentType: ct };
    }

    function responsesSection(op) {
      var responses = op.responses || {};
      var codes = Object.keys(responses);
      if (!codes.length) return '';
      var blocks = codes.map(function (code) {
        var r = responses[code] || {};
        var cls = code[0] === '2' ? 'ok' : code[0] === '4' || code[0] === '5' ? 'err' : 'other';
        var body = '';
        if (r.content && r.content['application/json']) {
          var example = exampleOf(r.content['application/json'].schema || {}, 0);
          if (example !== null) {
            body = '<pre class="code">' + esc(JSON.stringify(example, null, 2)) + '</pre>';
          }
        }
        return '<div class="response"><span class="status status-' + cls + '">' + esc(code) + '</span>' +
          '<span class="dim">' + esc(r.description || '') + '</span>' + body + '</div>';
      }).join('');
      return '<h4>Responses</h4>' + blocks;
    }

    function tryItSection(item, body) {
      var params = item.op.parameters || [];
      var inputs = params.map(function (prm, i) {
        return '<label class="try-field"><span>' + esc(prm.name) +
          ' <span class="chip chip-' + esc(prm.in) + '">' + esc(prm.in) + '</span></span>' +
          '<input data-param-index="' + i + '" placeholder="' + esc(typeLabel(prm.schema || {})) + '" /></label>';
      }).join('');
      var bodyEditor = body.example !== null
        ? '<label class="try-field"><span>Body (JSON)</span>' +
          '<textarea class="try-body" rows="6">' + esc(JSON.stringify(body.example, null, 2)) + '</textarea></label>'
        : '';
      return '<details class="try"><summary>Try it</summary><div class="try-form">' +
        inputs + bodyEditor +
        '<button type="button" class="btn-send">Send request</button>' +
        '<div class="try-result" hidden></div>' +
        '</div></details>';
    }

    function renderContent(groups) {
      var main = document.getElementById('content');
      main.innerHTML = '';

      var info = spec.info || {};
      if (info.description) {
        main.appendChild(el('<p class="api-desc">' + esc(info.description) + '</p>'));
      }

      Object.keys(groups).sort().forEach(function (tag) {
        main.appendChild(el('<h2 class="tag-heading">' + esc(tag) + '</h2>'));

        groups[tag].forEach(function (item) {
          var op = item.op;
          var body = bodySection(op);
          var deprecated = op.deprecated ? '<span class="chip chip-deprecated">deprecated</span>' : '';
          var secured = (op.security && op.security.length) ? '<span class="chip chip-auth">🔒 auth</span>' : '';

          var card = el('<article class="endpoint" id="' + opId(item.method, item.path) + '">' +
            '<button type="button" class="endpoint-head">' +
              '<span class="method method-' + item.method + '">' + item.method.toUpperCase() + '</span>' +
              '<code class="path">' + highlightPath(item.path) + '</code>' +
              '<span class="summary">' + esc(op.summary || '') + '</span>' +
              deprecated + secured +
              '<span class="chevron">▾</span>' +
            '</button>' +
            '<div class="endpoint-body" hidden>' +
              (op.description ? '<p class="dim">' + esc(op.description) + '</p>' : '') +
              paramsTable(op.parameters) +
              body.html +
              responsesSection(op) +
              tryItSection(item, body) +
            '</div>' +
          '</article>');

          card.setAttribute('data-search', (item.method + ' ' + item.path + ' ' + (op.summary || '') + ' ' + tag).toLowerCase());

          card.querySelector('.endpoint-head').addEventListener('click', function () {
            var bodyEl = card.querySelector('.endpoint-body');
            bodyEl.hidden = !bodyEl.hidden;
            card.classList.toggle('open', !bodyEl.hidden);
          });

          var sendBtn = card.querySelector('.btn-send');
          if (sendBtn) {
            sendBtn.addEventListener('click', function () {
              sendRequest(card, item, body.contentType);
            });
          }

          main.appendChild(card);
        });
      });
    }

    /* ------------------------------------------------------------------ *
     * Try-it request execution
     * ------------------------------------------------------------------ */

    function sendRequest(card, item, contentType) {
      var params = item.op.parameters || [];
      var url = item.path;
      var query = [];
      var headers = {};

      card.querySelectorAll('input[data-param-index]').forEach(function (input) {
        var prm = params[Number(input.getAttribute('data-param-index'))];
        var value = input.value;
        if (!value) return;
        if (prm.in === 'path') url = url.replace('{' + prm.name + '}', encodeURIComponent(value));
        else if (prm.in === 'query') query.push(encodeURIComponent(prm.name) + '=' + encodeURIComponent(value));
        else if (prm.in === 'header') headers[prm.name] = value;
      });

      var base = (spec.servers && spec.servers[0] && spec.servers[0].url) || '';
      // Same-origin base keeps the try-it panel working behind proxies.
      if (base.indexOf(location.origin) === 0) base = base.slice(location.origin.length);
      var fullUrl = base + url + (query.length ? '?' + query.join('&') : '');

      var init = { method: item.method.toUpperCase(), headers: headers };
      var bodyInput = card.querySelector('.try-body');
      if (bodyInput && bodyInput.value.trim()) {
        headers['Content-Type'] = contentType || 'application/json';
        init.body = bodyInput.value;
      }

      var resultEl = card.querySelector('.try-result');
      resultEl.hidden = false;
      resultEl.innerHTML = '<span class="dim">Sending…</span>';
      var started = performance.now();

      fetch(fullUrl, init).then(function (res) {
        return res.text().then(function (text) {
          var ms = Math.round(performance.now() - started);
          var pretty = text;
          try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch (e) { /* not JSON */ }
          var cls = res.ok ? 'ok' : 'err';
          resultEl.innerHTML =
            '<div class="try-meta"><span class="status status-' + cls + '">' + res.status + '</span>' +
            '<span class="dim">' + ms + ' ms</span></div>' +
            '<pre class="code">' + esc(pretty) + '</pre>';
        });
      }).catch(function (err) {
        resultEl.innerHTML = '<div class="try-meta"><span class="status status-err">failed</span></div>' +
          '<pre class="code">' + esc(String(err)) + '</pre>';
      });
    }

    /* ------------------------------------------------------------------ *
     * Search
     * ------------------------------------------------------------------ */

    document.getElementById('search').addEventListener('input', function (event) {
      var q = event.target.value.toLowerCase().trim();
      document.querySelectorAll('[data-search]').forEach(function (node) {
        node.style.display = !q || node.getAttribute('data-search').indexOf(q) !== -1 ? '' : 'none';
      });
      document.querySelectorAll('.nav-group, .tag-heading').forEach(function (node) {
        if (node.classList.contains('nav-group')) {
          var visible = node.querySelectorAll('.nav-item:not([style*="none"])').length;
          node.style.display = visible ? '' : 'none';
        }
      });
    });

    /* ------------------------------------------------------------------ *
     * Boot
     * ------------------------------------------------------------------ */

    fetch(SPEC_URL).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (doc) {
      spec = doc;
      var info = spec.info || {};
      if (info.title) {
        document.getElementById('api-title').textContent = info.title;
        document.title = info.title;
      }
      if (info.version) {
        var chip = document.getElementById('api-version');
        chip.textContent = 'v' + info.version;
        chip.hidden = false;
      }
      var groups = collectOperations();
      renderSidebar(groups);
      renderContent(groups);
    }).catch(function (err) {
      document.getElementById('content').innerHTML =
        '<div class="loading">Failed to load ' + esc(SPEC_URL) + ' — ' + esc(String(err)) + '</div>';
    });
  })();
  </script>
</body>
</html>`;
}

/** The full stylesheet, parameterised only by the sanitized accent colour. */
function buildCss(accent: string): string {
  return `
    :root {
      --accent: ${accent};
      --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      --mono: ui-monospace, 'Cascadia Code', 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
    }
    [data-theme='light'] {
      --bg: #ffffff; --bg-2: #f6f8fa; --bg-3: #eef1f5;
      --fg: #1a2130; --fg-2: rgba(26, 33, 48, 0.72); --fg-3: rgba(26, 33, 48, 0.5);
      --border: rgba(26, 33, 48, 0.1); --shadow: rgba(20, 24, 36, 0.06);
    }
    [data-theme='dark'] {
      --bg: #171c26; --bg-2: #1e2532; --bg-3: #27303f;
      --fg: rgba(240, 245, 252, 0.94); --fg-2: rgba(214, 224, 238, 0.72); --fg-3: rgba(190, 203, 222, 0.5);
      --border: rgba(214, 226, 242, 0.1); --shadow: rgba(0, 0, 0, 0.28);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; background: var(--bg); color: var(--fg);
      font-family: var(--font); font-size: 15px; line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }
    .mono, code, pre { font-family: var(--mono); }
    .dim { color: var(--fg-2); }

    .topbar {
      position: sticky; top: 0; z-index: 10;
      display: flex; align-items: center; justify-content: space-between; gap: 16px;
      padding: 12px 20px; background: var(--bg); border-bottom: 1px solid var(--border);
    }
    .brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .brand-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--accent); flex: none; }
    .brand-title { font-weight: 700; font-size: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .topbar-actions { display: flex; align-items: center; gap: 10px; }
    .search {
      width: 230px; padding: 7px 12px; border-radius: 8px;
      border: 1px solid var(--border); background: var(--bg-2); color: var(--fg);
      font-size: 13px; outline: none;
    }
    .search:focus { border-color: var(--accent); }
    .btn-ghost {
      padding: 7px 12px; border-radius: 8px; border: 1px solid var(--border);
      background: transparent; color: var(--fg-2); font-size: 13px;
      cursor: pointer; text-decoration: none; white-space: nowrap;
    }
    .btn-ghost:hover { color: var(--fg); border-color: var(--accent); }

    .layout { display: flex; min-height: calc(100vh - 57px); }
    .sidebar {
      width: 290px; flex: none; padding: 16px 12px;
      border-right: 1px solid var(--border); background: var(--bg-2);
      position: sticky; top: 57px; height: calc(100vh - 57px); overflow-y: auto;
    }
    .nav-tag {
      font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px;
      color: var(--fg-3); padding: 14px 8px 6px;
    }
    .nav-item {
      display: flex; align-items: center; gap: 8px; padding: 6px 8px;
      border-radius: 7px; text-decoration: none; color: var(--fg-2); font-size: 13px;
    }
    .nav-item:hover { background: var(--bg-3); color: var(--fg); }
    .nav-path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--mono); font-size: 12px; }

    .content { flex: 1; padding: 24px 32px 80px; max-width: 980px; }
    .api-desc { color: var(--fg-2); max-width: 720px; }
    .tag-heading { margin: 34px 0 12px; font-size: 20px; }
    .loading { padding: 60px 0; text-align: center; color: var(--fg-3); }

    .endpoint {
      border: 1px solid var(--border); border-radius: 12px; margin-bottom: 12px;
      background: var(--bg-2); box-shadow: 0 1px 3px var(--shadow); overflow: hidden;
    }
    .endpoint.open { border-color: var(--accent); }
    .endpoint-head {
      display: flex; align-items: center; gap: 12px; width: 100%;
      padding: 13px 16px; background: none; border: none; cursor: pointer;
      color: var(--fg); font-family: var(--font); font-size: 14px; text-align: left;
    }
    .path { font-size: 13.5px; font-weight: 600; }
    .path-param { color: var(--accent); }
    .summary { color: var(--fg-2); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
    .chevron { color: var(--fg-3); transition: transform 0.15s; }
    .endpoint.open .chevron { transform: rotate(180deg); }
    .endpoint-body { padding: 4px 18px 18px; border-top: 1px solid var(--border); }
    .endpoint-body h4 { margin: 18px 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.6px; color: var(--fg-3); }

    .method {
      flex: none; width: 58px; text-align: center; padding: 3px 0;
      border-radius: 6px; font-size: 11px; font-weight: 800; letter-spacing: 0.4px;
      font-family: var(--mono); color: #fff;
    }
    .method-get { background: #2f81f7; }
    .method-post { background: #3fb950; }
    .method-put { background: #d29922; }
    .method-patch { background: #a371f7; }
    .method-delete { background: #f85149; }
    .method-options, .method-head { background: #768390; }

    .chip {
      display: inline-block; padding: 2px 8px; border-radius: 20px;
      font-size: 11px; font-weight: 600; background: var(--bg-3); color: var(--fg-2);
    }
    .chip-path { color: var(--accent); }
    .chip-deprecated { background: #f8514922; color: #f85149; text-decoration: line-through; }
    .chip-auth { background: #d2992222; color: #d29922; }

    .params { width: 100%; border-collapse: collapse; font-size: 13px; }
    .params th {
      text-align: left; padding: 6px 10px; color: var(--fg-3); font-weight: 600;
      border-bottom: 1px solid var(--border); font-size: 12px;
    }
    .params td { padding: 7px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
    .req { color: #f85149; font-style: normal; margin-left: 2px; }

    .schema { border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; background: var(--bg); margin-bottom: 8px; }
    .prop { display: flex; flex-wrap: wrap; gap: 10px; padding: 3px 0 3px calc(var(--indent, 0) * 18px); font-size: 13px; align-items: baseline; }
    .prop-name { font-family: var(--mono); font-weight: 600; }
    .prop-type { color: var(--accent); font-family: var(--mono); font-size: 12px; }
    .prop-constraints { color: var(--fg-3); font-size: 12px; }
    .prop-desc { color: var(--fg-2); font-size: 12.5px; flex-basis: 100%; padding-left: 12px; }

    .code {
      background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
      padding: 12px 14px; font-size: 12.5px; overflow-x: auto; margin: 8px 0;
      max-height: 380px; overflow-y: auto;
    }

    .response { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 6px; }
    .response .code { flex-basis: 100%; }
    .status {
      font-family: var(--mono); font-weight: 700; font-size: 12px;
      padding: 2px 9px; border-radius: 6px;
    }
    .status-ok { background: #3fb95022; color: #3fb950; }
    .status-err { background: #f8514922; color: #f85149; }
    .status-other { background: var(--bg-3); color: var(--fg-2); }

    .try { margin-top: 18px; border: 1px dashed var(--border); border-radius: 10px; }
    .try summary {
      cursor: pointer; padding: 10px 14px; font-weight: 600; font-size: 13px;
      color: var(--accent); user-select: none;
    }
    .try-form { padding: 4px 14px 14px; display: flex; flex-direction: column; gap: 10px; }
    .try-field { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--fg-2); }
    .try-field input, .try-field textarea {
      padding: 8px 10px; border-radius: 8px; border: 1px solid var(--border);
      background: var(--bg); color: var(--fg); font-family: var(--mono); font-size: 12.5px; outline: none;
    }
    .try-field input:focus, .try-field textarea:focus { border-color: var(--accent); }
    .btn-send {
      align-self: flex-start; padding: 8px 18px; border-radius: 8px; border: none;
      background: var(--accent); color: #fff; font-weight: 700; font-size: 13px; cursor: pointer;
    }
    .btn-send:hover { filter: brightness(1.1); }
    .try-meta { display: flex; align-items: center; gap: 10px; margin-top: 4px; }

    @media (max-width: 900px) {
      .sidebar { display: none; }
      .content { padding: 18px 14px 60px; }
      .search { width: 140px; }
      .summary { display: none; }
    }
  `;
}
