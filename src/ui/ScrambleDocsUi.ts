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
 * air-gapped network, behind a corporate proxy, and offline.
 *
 * The layout is a Postman-style workspace:
 * - an Overview page with live API stats,
 * - a sidebar with collapsible request groups and a request history,
 * - a request builder with breadcrumb, a live-syncing URL bar and Send button,
 * - Params (with enable checkboxes and ghost rows) / Auth (per-request,
 *   inheriting from a global Authorization helper) / Headers / Body (mode
 *   selector) / Docs / Code (cURL, fetch, axios snippets) tabs,
 * - a response viewer with Body / Headers tabs,
 * - one-click export of the whole API as a Postman Collection v2.1.
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
    <div class="brand" id="brand" role="button" tabindex="0" title="Overview">
      <span class="brand-dot"></span>
      <span class="brand-title" id="api-title">API Documentation</span>
      <span class="chip" id="api-version" hidden></span>
    </div>
    <div class="topbar-actions">
      <input type="search" id="search" class="search" placeholder="Search requests…" autocomplete="off" />
      <select id="env-select" class="env-select" title="Environment"></select>
      <button type="button" class="btn-ghost" id="auth-btn">🔑 Auth</button>
      <button type="button" class="btn-ghost" id="export-postman">⬇ Postman</button>
      <a class="btn-ghost" id="spec-link" href="${specUrl}" target="_blank" rel="noopener">OpenAPI</a>
      <button type="button" class="btn-ghost" id="theme-toggle" aria-label="Toggle theme">◐</button>
    </div>
    <div class="auth-pop" id="auth-pop" hidden>
      <div class="auth-title">Global Authorization <span class="dim">(default for every request)</span></div>
      <label class="auth-field"><span>Type</span>
        <select id="auth-type">
          <option value="none">No auth</option>
          <option value="bearer">Bearer token</option>
          <option value="apikey">API key header</option>
        </select>
      </label>
      <label class="auth-field" id="auth-header-row" hidden><span>Header</span>
        <input id="auth-header" placeholder="X-API-Key" autocomplete="off" />
      </label>
      <label class="auth-field" id="auth-token-row" hidden><span>Value</span>
        <input id="auth-token" placeholder="token…" autocomplete="off" />
      </label>
      <div class="dim auth-note">Stored in your browser only. Requests can override it in their Auth tab.</div>
    </div>
    <div class="auth-pop env-pop" id="env-pop" hidden>
      <div class="auth-title">Environments <span class="dim">(base URL + variables)</span></div>
      <div class="env-list" id="env-list"></div>
      <label class="auth-field"><span>Name</span>
        <input id="env-name" placeholder="staging" autocomplete="off" />
      </label>
      <label class="auth-field"><span>Base URL <span class="dim">(optional — overrides the server URL)</span></span>
        <input id="env-base" placeholder="https://staging.example.com" autocomplete="off" />
      </label>
      <label class="auth-field"><span>Variables <span class="dim">(KEY=value, one per line — use {{KEY}} anywhere)</span></span>
        <textarea id="env-vars" rows="4" placeholder="userId=42&#10;token=abc" spellcheck="false"></textarea>
      </label>
      <div class="env-actions">
        <button type="button" class="btn-add" id="env-save">Save</button>
        <button type="button" class="btn-add" id="env-new">New</button>
        <button type="button" class="btn-add env-delete" id="env-delete" hidden>Delete</button>
      </div>
      <div class="dim auth-note">Stored in your browser only.</div>
    </div>
  </header>
  <div class="layout">
    <nav class="sidebar">
      <button type="button" class="overview-link active" id="overview-link">
        <span class="ov-icon">⌂</span> Overview
      </button>
      <div class="side-tabs">
        <button type="button" class="side-tab active" data-side="collections">Collections</button>
        <button type="button" class="side-tab" data-side="history">History <span class="tab-count" id="history-count" hidden></span></button>
      </div>
      <div id="side-collections" class="side-panel"></div>
      <div id="side-history" class="side-panel" hidden></div>
    </nav>
    <main class="workspace">
      <section id="welcome" class="welcome">
        <div class="welcome-inner">
          <div class="ov-badge">⚡ generated by nest-scramble</div>
          <h1 id="welcome-title">API Documentation</h1>
          <p id="welcome-desc" class="dim"></p>
          <div class="ov-cards">
            <div class="ov-card"><b id="ov-requests">—</b><span>Requests</span></div>
            <div class="ov-card"><b id="ov-groups">—</b><span>Groups</span></div>
            <div class="ov-card"><b id="ov-version">—</b><span>Version</span></div>
            <div class="ov-card ov-card-wide"><b id="ov-base" class="ov-base">—</b><span>Base URL</span></div>
          </div>
          <div class="ov-methods" id="ov-methods"></div>
          <p class="dim ov-hint">Select a request from the sidebar to inspect and send it.</p>
          <div class="ov-schemas" id="ov-schemas"></div>
        </div>
      </section>
      <section id="request-view" hidden>
        <div class="crumbs">
          <button type="button" class="crumb-link" id="crumb-overview">Overview</button>
          <span class="crumb-sep">›</span>
          <span class="crumb" id="crumb-group"></span>
          <span class="crumb-sep">›</span>
          <b class="crumb" id="crumb-name"></b>
        </div>
        <div class="req-bar">
          <span class="method" id="req-method">GET</span>
          <input class="url-input" id="url-input" spellcheck="false" autocomplete="off" />
          <button type="button" class="btn-send" id="send-btn">Send</button>
          <button type="button" class="btn-ghost btn-share" id="share-btn" title="Copy a shareable link to this request">🔗</button>
        </div>
        <div class="req-summary">
          <span id="req-summary-text" class="dim"></span>
          <span id="req-chips"></span>
          <span class="req-hint dim">Ctrl+Enter to send</span>
        </div>
        <div class="tabs" id="tabs">
          <button type="button" class="tab active" data-tab="params">Params<span class="dot" id="dot-params" hidden></span></button>
          <button type="button" class="tab" data-tab="auth">Auth<span class="dot" id="dot-auth" hidden></span></button>
          <button type="button" class="tab" data-tab="headers">Headers <span class="tab-count" id="count-headers" hidden></span></button>
          <button type="button" class="tab" data-tab="body">Body</button>
          <button type="button" class="tab" data-tab="docs">Docs</button>
          <button type="button" class="tab" data-tab="code">Code</button>
        </div>
        <div class="panel" data-panel="params" id="panel-params"></div>
        <div class="panel" data-panel="auth" id="panel-auth" hidden></div>
        <div class="panel" data-panel="headers" id="panel-headers" hidden></div>
        <div class="panel" data-panel="body" id="panel-body" hidden></div>
        <div class="panel" data-panel="docs" id="panel-docs" hidden></div>
        <div class="panel" data-panel="code" id="panel-code" hidden>
          <div class="code-bar">
            <select id="code-lang">
              <option value="curl">cURL</option>
              <option value="fetch">JavaScript — fetch</option>
              <option value="axios">JavaScript — axios</option>
            </select>
            <button type="button" class="btn-add" id="copy-code">Copy</button>
          </div>
          <pre class="code" id="code-snippet"></pre>
        </div>
        <div class="resp">
          <div class="resp-head">
            <div class="resp-tabs">
              <span class="resp-title">Response</span>
              <button type="button" class="rtab active" data-rtab="body">Body</button>
              <button type="button" class="rtab" data-rtab="headers">Headers</button>
              <button type="button" class="btn-add btn-copy-resp" id="copy-resp" hidden>Copy</button>
              <button type="button" class="btn-add btn-copy-resp" id="dl-resp" hidden>Download</button>
            </div>
            <span class="resp-meta" id="resp-meta"></span>
          </div>
          <div class="resp-panel" data-rpanel="body" id="resp-body">
            <div class="resp-empty">Hit <b>Send</b> to see the response here.</div>
          </div>
          <div class="resp-panel" data-rpanel="headers" id="resp-headers" hidden></div>
        </div>
      </section>
      <section id="ws-view" hidden>
        <div class="crumbs">
          <button type="button" class="crumb-link" id="ws-crumb-overview">Overview</button>
          <span class="crumb-sep">›</span>
          <span class="crumb" id="ws-crumb-gateway"></span>
          <span class="crumb-sep">›</span>
          <b class="crumb" id="ws-crumb-event"></b>
        </div>
        <div class="req-bar">
          <span class="method method-ws">WS</span>
          <input class="url-input" id="ws-url" spellcheck="false" autocomplete="off" />
          <select id="ws-transport" class="raw-lang" title="Transport">
            <option value="socketio">Socket.IO</option>
            <option value="ws">Raw WebSocket</option>
          </select>
          <button type="button" class="btn-send" id="ws-connect">Connect</button>
        </div>
        <div class="req-summary">
          <span id="ws-summary" class="dim"></span>
          <span class="chip" id="ws-status">disconnected</span>
        </div>
        <div class="ws-compose">
          <input id="ws-event-name" class="ws-event-input" placeholder="event" spellcheck="false" autocomplete="off" />
          <button type="button" class="btn-send" id="ws-send" disabled>Send</button>
        </div>
        <textarea class="body-editor" id="ws-payload" rows="8" spellcheck="false"></textarea>
        <div class="ws-doc" id="ws-doc"></div>
        <div class="resp">
          <div class="resp-head">
            <div class="resp-tabs">
              <span class="resp-title">Events</span>
              <button type="button" class="btn-add" id="ws-clear">Clear</button>
            </div>
            <span class="resp-meta" id="ws-meta"></span>
          </div>
          <div class="resp-panel" id="ws-log">
            <div class="resp-empty">Connect and send an event to see live traffic here.</div>
          </div>
        </div>
      </section>
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

    function byId(id) { return document.getElementById(id); }

    function store(key, value) {
      try {
        if (value === undefined) return localStorage.getItem(key);
        localStorage.setItem(key, value);
      } catch (e) { return null; }
    }

    function copyText(text, button) {
      var done = function () {
        var old = button.textContent;
        button.textContent = 'Copied!';
        setTimeout(function () { button.textContent = old; }, 1200);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, done);
      } else {
        var ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) { /* ignore */ }
        document.body.removeChild(ta);
        done();
      }
    }

    /** Lightweight JSON syntax highlighter (operates on escaped text). */
    function hljson(text) {
      return esc(text).replace(
        /(&quot;.*?&quot;)(\\s*:)?|\\b(true|false|null)\\b|(-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)/g,
        function (m, str, colon, bool, num) {
          if (str) return '<span class="' + (colon ? 'j-key' : 'j-str') + '">' + str + '</span>' + (colon || '');
          if (bool) return '<span class="j-bool">' + bool + '</span>';
          if (num) return '<span class="j-num">' + num + '</span>';
          return m;
        }
      );
    }

    /* ------------------------------------------------------------------ *
     * Theme
     * ------------------------------------------------------------------ */

    var root = document.documentElement;
    var savedTheme = store('scramble-theme');
    if (savedTheme === 'dark' || savedTheme === 'light') root.setAttribute('data-theme', savedTheme);

    byId('theme-toggle').addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      store('scramble-theme', next);
    });

    /* ------------------------------------------------------------------ *
     * Global Authorization (Postman-style, persisted locally)
     * ------------------------------------------------------------------ */

    function getAuth() {
      try { return JSON.parse(store('scramble-auth') || '{}'); } catch (e) { return {}; }
    }

    function saveAuth(auth) {
      store('scramble-auth', JSON.stringify(auth));
      byId('auth-btn').classList.toggle('auth-on', auth.type === 'bearer' || auth.type === 'apikey');
    }

    (function initAuthPop() {
      var pop = byId('auth-pop');
      var typeEl = byId('auth-type');
      var tokenEl = byId('auth-token');
      var headerEl = byId('auth-header');

      var auth = getAuth();
      typeEl.value = auth.type || 'none';
      tokenEl.value = auth.token || '';
      headerEl.value = auth.header || '';
      syncRows();
      saveAuth(auth);

      function syncRows() {
        byId('auth-token-row').hidden = typeEl.value === 'none';
        byId('auth-header-row').hidden = typeEl.value !== 'apikey';
      }

      function persist() {
        syncRows();
        saveAuth({ type: typeEl.value, token: tokenEl.value, header: headerEl.value });
        if (current) { renderAuthPanel(); renderHeadersPanel(); }
      }

      typeEl.addEventListener('change', persist);
      tokenEl.addEventListener('input', persist);
      headerEl.addEventListener('input', persist);

      byId('auth-btn').addEventListener('click', function (event) {
        event.stopPropagation();
        pop.hidden = !pop.hidden;
      });
      pop.addEventListener('click', function (event) { event.stopPropagation(); });
      document.addEventListener('click', function () { pop.hidden = true; });
    })();

    /* ------------------------------------------------------------------ *
     * Environments (Postman-style: base URL + {{variables}}, persisted)
     * ------------------------------------------------------------------ */

    function getEnvs() {
      try { return JSON.parse(store('scramble-envs') || '[]'); } catch (e) { return []; }
    }

    function saveEnvs(envs) { store('scramble-envs', JSON.stringify(envs)); }

    function activeEnv() {
      var name = store('scramble-env-active');
      if (!name) return null;
      var envs = getEnvs();
      for (var i = 0; i < envs.length; i++) if (envs[i].name === name) return envs[i];
      return null;
    }

    function parseVars(text) {
      var vars = {};
      String(text || '').split('\\n').forEach(function (line) {
        var eq = line.indexOf('=');
        if (eq > 0) vars[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
      });
      return vars;
    }

    function varsText(vars) {
      return Object.keys(vars || {}).map(function (key) { return key + '=' + vars[key]; }).join('\\n');
    }

    /** Replaces {{name}} placeholders with the active environment's variables. */
    function applyVars(text) {
      var env = activeEnv();
      if (!env || !text) return text;
      return String(text).replace(/\\{\\{\\s*([\\w.-]+)\\s*\\}\\}/g, function (match, key) {
        return env.vars && env.vars[key] !== undefined ? env.vars[key] : match;
      });
    }

    var envEditing = null;

    function renderEnvSelect() {
      var select = byId('env-select');
      var activeName = store('scramble-env-active') || '';
      var options = '<option value="">No environment</option>';
      getEnvs().forEach(function (env) {
        options += '<option value="' + esc(env.name) + '"' + (env.name === activeName ? ' selected' : '') + '>' + esc(env.name) + '</option>';
      });
      options += '<option value="__manage">⚙ Manage environments…</option>';
      select.innerHTML = options;
    }

    function renderEnvList() {
      var list = byId('env-list');
      var envs = getEnvs();
      if (!envs.length) {
        list.innerHTML = '<div class="dim env-empty">No environments yet — create one below.</div>';
        return;
      }
      list.innerHTML = '';
      envs.forEach(function (env) {
        var row = el('<button type="button" class="env-item' + (envEditing === env.name ? ' active' : '') + '">' +
          esc(env.name) + (env.baseUrl ? ' <span class="dim">' + esc(env.baseUrl) + '</span>' : '') +
        '</button>');
        row.addEventListener('click', function () {
          envEditing = env.name;
          byId('env-name').value = env.name;
          byId('env-base').value = env.baseUrl || '';
          byId('env-vars').value = varsText(env.vars);
          byId('env-delete').hidden = false;
          renderEnvList();
        });
        list.appendChild(row);
      });
    }

    (function initEnvironments() {
      var pop = byId('env-pop');
      var select = byId('env-select');

      renderEnvSelect();

      select.addEventListener('change', function () {
        if (select.value === '__manage') {
          renderEnvSelect();
          renderEnvList();
          byId('auth-pop').hidden = true;
          // The click that picked the option also reaches the document
          // listener in some browsers; deferring keeps the popup open.
          setTimeout(function () { pop.hidden = false; }, 0);
          return;
        }
        store('scramble-env-active', select.value);
      });

      byId('env-new').addEventListener('click', function () {
        envEditing = null;
        byId('env-name').value = '';
        byId('env-base').value = '';
        byId('env-vars').value = '';
        byId('env-delete').hidden = true;
        renderEnvList();
      });

      byId('env-save').addEventListener('click', function () {
        var name = byId('env-name').value.trim();
        if (!name) return;
        var envs = getEnvs().filter(function (env) { return env.name !== envEditing && env.name !== name; });
        envs.push({ name: name, baseUrl: byId('env-base').value.trim(), vars: parseVars(byId('env-vars').value) });
        saveEnvs(envs);
        store('scramble-env-active', name);
        envEditing = name;
        byId('env-delete').hidden = false;
        renderEnvSelect();
        renderEnvList();
      });

      byId('env-delete').addEventListener('click', function () {
        if (!envEditing) return;
        saveEnvs(getEnvs().filter(function (env) { return env.name !== envEditing; }));
        if (store('scramble-env-active') === envEditing) store('scramble-env-active', '');
        envEditing = null;
        byId('env-name').value = '';
        byId('env-base').value = '';
        byId('env-vars').value = '';
        byId('env-delete').hidden = true;
        renderEnvSelect();
        renderEnvList();
      });

      pop.addEventListener('click', function (event) { event.stopPropagation(); });
      document.addEventListener('click', function () { pop.hidden = true; });
    })();

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
     * Operation model
     * ------------------------------------------------------------------ */

    var METHOD_ORDER = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];
    var opsById = {};
    var groupsCache = {};
    var current = null;
    var reqAuth = {};
    var bodyMode = 'none';

    function collectOperations() {
      var groups = {};
      Object.keys(spec.paths || {}).forEach(function (p) {
        METHOD_ORDER.forEach(function (m) {
          var op = spec.paths[p][m];
          if (!op) return;
          var tag = (op.tags && op.tags[0]) || p.split('/')[1] || 'default';
          var item = { path: p, method: m, op: op, tag: tag, id: opId(m, p) };
          opsById[item.id] = item;
          (groups[tag] = groups[tag] || []).push(item);
        });
      });
      groupsCache = groups;
      return groups;
    }

    function opId(method, p) {
      return 'op-' + method + '-' + p.replace(/[^a-zA-Z0-9]/g, '-');
    }

    function highlightPath(p) {
      return esc(p).replace(/\\{([^}]+)\\}/g, '<span class="path-param">{$1}</span>');
    }

    function bodyInfo(op) {
      var rb = op.requestBody;
      if (!rb || !rb.content) return { contentType: null, schema: null, example: null };
      var ct = Object.keys(rb.content)[0];
      var schema = rb.content[ct].schema || null;
      var example = ct === 'application/json' && schema ? exampleOf(schema, 0) : null;
      return { contentType: ct, schema: schema, example: example };
    }

    function baseUrl() {
      var base = (spec.servers && spec.servers[0] && spec.servers[0].url) || '';
      if (base.indexOf(location.origin) === 0) base = base.slice(location.origin.length);
      return base;
    }

    /* ------------------------------------------------------------------ *
     * Overview page
     * ------------------------------------------------------------------ */

    function showOverview() {
      current = null;
      try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignore */ }
      byId('welcome').hidden = false;
      byId('request-view').hidden = true;
      byId('ws-view').hidden = true;
      byId('overview-link').classList.add('active');
      var active = document.querySelector('.nav-item.active');
      if (active) active.classList.remove('active');
    }

    byId('overview-link').addEventListener('click', showOverview);
    byId('brand').addEventListener('click', showOverview);
    byId('brand').addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') showOverview();
    });

    function renderOverview(groups) {
      var info = spec.info || {};
      var opCount = Object.keys(opsById).length;
      var groupCount = Object.keys(groups).length;

      byId('ov-requests').textContent = opCount;
      byId('ov-groups').textContent = groupCount;
      byId('ov-version').textContent = info.version ? 'v' + info.version : '—';
      byId('ov-base').textContent = (baseUrl() && baseUrl() !== '') ? baseUrl() : location.origin;

      var perMethod = {};
      Object.keys(opsById).forEach(function (id) {
        var m = opsById[id].method;
        perMethod[m] = (perMethod[m] || 0) + 1;
      });
      byId('ov-methods').innerHTML = METHOD_ORDER.filter(function (m) { return perMethod[m]; })
        .map(function (m) {
          return '<span class="ov-method"><span class="method method-sm method-' + m + '">' +
            methodShort(m) + '</span> ' + perMethod[m] + '</span>';
        }).join('');

      renderSchemas();
    }

    /** Swagger-style expandable model browser on the Overview page. */
    function renderSchemas() {
      var schemas = (spec.components && spec.components.schemas) || {};
      var names = Object.keys(schemas).sort();
      var host = byId('ov-schemas');
      if (!names.length) { host.innerHTML = ''; return; }

      host.innerHTML = '<h4 class="ov-schemas-title">Schemas <span class="tab-count">' + names.length + '</span></h4>' +
        names.map(function (name) {
          return '<div class="schema-item">' +
            '<button type="button" class="schema-head"><span class="chev">▸</span>' + esc(name) + '</button>' +
            '<div class="schema-body" hidden><div class="schema">' +
              (schemaTree(schemas[name], 0) || '<span class="dim">No properties.</span>') +
            '</div></div>' +
          '</div>';
        }).join('');

      host.querySelectorAll('.schema-head').forEach(function (head) {
        head.addEventListener('click', function () {
          var body = head.nextElementSibling;
          body.hidden = !body.hidden;
          head.classList.toggle('open', !body.hidden);
        });
      });
    }

    /* ------------------------------------------------------------------ *
     * Sidebar: Collections + History
     * ------------------------------------------------------------------ */

    document.querySelectorAll('.side-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        document.querySelectorAll('.side-tab').forEach(function (other) {
          other.classList.toggle('active', other === tab);
        });
        byId('side-collections').hidden = tab.getAttribute('data-side') !== 'collections';
        byId('side-history').hidden = tab.getAttribute('data-side') !== 'history';
      });
    });

    function renderSidebar(groups) {
      var nav = byId('side-collections');
      nav.innerHTML = '';
      Object.keys(groups).sort().forEach(function (tag, index) {
        var group = el('<div class="group' + (index === 0 ? ' open' : '') + '">' +
          '<button type="button" class="group-head">' +
            '<span class="chev">▸</span>' +
            '<span class="group-name">' + esc(tag) + '</span>' +
            '<span class="group-count">' + groups[tag].length + '</span>' +
          '</button>' +
          '<div class="group-items"></div>' +
        '</div>');

        group.querySelector('.group-head').addEventListener('click', function () {
          group.classList.toggle('open');
        });

        var itemsEl = group.querySelector('.group-items');
        groups[tag].forEach(function (item) {
          var a = el('<button type="button" class="nav-item" id="nav-' + item.id + '">' +
            '<span class="method method-sm method-' + item.method + '">' + methodShort(item.method) + '</span>' +
            '<span class="nav-text">' +
              '<span class="nav-name">' + esc(item.op.summary || item.path) + '</span>' +
              '<span class="nav-path">' + highlightPath(item.path) + '</span>' +
            '</span>' +
          '</button>');
          a.setAttribute('data-search', (item.method + ' ' + item.path + ' ' + (item.op.summary || '') + ' ' + tag).toLowerCase());
          a.addEventListener('click', function () { selectOperation(item); });
          itemsEl.appendChild(a);
        });

        nav.appendChild(group);
      });
    }

    function methodShort(m) {
      if (m === 'delete') return 'DEL';
      if (m === 'options') return 'OPT';
      if (m === 'patch') return 'PAT';
      return m.toUpperCase();
    }

    /* ---- History (persisted, Postman-style) ---- */

    function getHistory() {
      try { return JSON.parse(store('scramble-history') || '[]'); } catch (e) { return []; }
    }

    function pushHistory(entry) {
      var history = getHistory();
      history.unshift(entry);
      if (history.length > 25) history.length = 25;
      store('scramble-history', JSON.stringify(history));
      renderHistory();
    }

    function renderHistory() {
      var history = getHistory();
      var panel = byId('side-history');
      var count = byId('history-count');
      count.hidden = history.length === 0;
      count.textContent = history.length;

      if (!history.length) {
        panel.innerHTML = '<div class="panel-empty">Requests you send will appear here.</div>';
        return;
      }

      panel.innerHTML = '<button type="button" class="btn-add history-clear" id="clear-history">Clear history</button>';
      history.forEach(function (entry) {
        var cls = entry.status >= 200 && entry.status < 300 ? 'ok' : entry.status === 0 ? 'err' : entry.status >= 400 ? 'err' : 'other';
        var row = el('<button type="button" class="nav-item history-item">' +
          '<span class="method method-sm method-' + esc(entry.method) + '">' + methodShort(entry.method) + '</span>' +
          '<span class="nav-text">' +
            '<span class="nav-name">' + esc(entry.url) + '</span>' +
            '<span class="nav-path">' +
              '<span class="hist-status hist-' + cls + '">' + (entry.status || 'ERR') + '</span> · ' +
              esc(entry.ms) + ' ms · ' + esc(entry.at) +
            '</span>' +
          '</span>' +
        '</button>');
        row.addEventListener('click', function () {
          var item = opsById[entry.opId];
          if (item) {
            selectOperation(item);
            byId('url-input').value = entry.url;
          }
        });
        panel.appendChild(row);
      });

      byId('clear-history').addEventListener('click', function () {
        store('scramble-history', '[]');
        renderHistory();
      });
    }

    /* ------------------------------------------------------------------ *
     * Request view
     * ------------------------------------------------------------------ */

    function selectOperation(item) {
      current = item;
      try { history.replaceState(null, '', '#' + item.id); } catch (e) { /* ignore */ }

      byId('overview-link').classList.remove('active');
      var active = document.querySelector('.nav-item.active');
      if (active) active.classList.remove('active');
      var navEl = byId('nav-' + item.id);
      if (navEl) {
        navEl.classList.add('active');
        var group = navEl.closest('.group');
        if (group) group.classList.add('open');
      }

      byId('welcome').hidden = true;
      byId('request-view').hidden = false;
      byId('ws-view').hidden = true;

      byId('crumb-group').textContent = item.tag;
      byId('crumb-name').textContent = item.op.summary || item.path;

      var methodEl = byId('req-method');
      methodEl.textContent = item.method.toUpperCase();
      methodEl.className = 'method method-' + item.method;

      byId('req-summary-text').textContent = item.op.summary || '';

      var chips = '';
      if (item.op.deprecated) chips += '<span class="chip chip-deprecated">deprecated</span>';
      if (item.op.security && item.op.security.length) chips += '<span class="chip chip-auth">🔒 auth</span>';
      byId('req-chips').innerHTML = chips;

      var body = bodyInfo(item.op);
      bodyMode = body.contentType ? 'raw' : 'none';
      renderParamsPanel(item);
      renderAuthPanel();
      renderHeadersPanel();
      renderBodyPanel(body);
      renderDocsPanel(item, body);
      resetResponse();
      syncUrl();
      activateTab(defaultTab(item, body));
    }

    function defaultTab(item, body) {
      var params = item.op.parameters || [];
      var hasParams = params.some(function (p) { return p.in === 'path' || p.in === 'query'; });
      if (hasParams) return 'params';
      if (body.contentType) return 'body';
      return 'docs';
    }

    /* ---- Params panel: checkboxes, ghost rows, live URL sync ---- */

    function checkCell(checked, disabled) {
      return '<label class="kv-check-cell"><input type="checkbox" class="kv-check"' +
        (checked ? ' checked' : '') + (disabled ? ' disabled' : '') + ' /></label>';
    }

    function renderParamsPanel(item) {
      var params = (item.op.parameters || []).filter(function (p) {
        return p.in === 'path' || p.in === 'query';
      });
      var panel = byId('panel-params');

      var rows = params.map(function (prm) {
        return '<div class="kv-row" data-kind="' + esc(prm.in) + '" data-name="' + esc(prm.name) + '">' +
          checkCell(true, prm.in === 'path') +
          '<span class="kv-key">' + esc(prm.name) + (prm.required ? '<i class="req">*</i>' : '') +
            ' <span class="chip chip-' + esc(prm.in) + '">' + esc(prm.in) + '</span></span>' +
          '<input class="kv-input" placeholder="' + esc(typeLabel(prm.schema || {}) || 'value') + '" />' +
          '<span class="kv-desc">' + esc(prm.description || constraintsLabel(prm.schema || {})) + '</span>' +
        '</div>';
      }).join('');

      panel.innerHTML = '<div class="kv-table" id="params-table">' +
        '<div class="kv-row kv-header-row">' +
          '<span class="kv-check-cell"></span>' +
          '<span class="kv-head">Key</span><span class="kv-head">Value</span><span class="kv-head">Description</span>' +
        '</div>' +
        rows +
      '</div>';

      appendGhostRow(byId('params-table'), 'query');
    }

    /** A Postman-style empty row: typing into it turns it into a real row. */
    function appendGhostRow(table, kind) {
      var ghost = el('<div class="kv-row kv-ghost" data-kind="' + kind + '">' +
        checkCell(false, true) +
        '<input class="kv-input kv-custom-key" placeholder="Key" />' +
        '<input class="kv-input kv-custom-value" placeholder="Value" />' +
        '<span class="kv-desc dim"></span>' +
      '</div>');

      var materialised = false;
      ghost.querySelectorAll('input[type=text], input:not([type])').forEach(function (input) {
        input.addEventListener('input', function () {
          if (materialised) return;
          materialised = true;
          ghost.classList.remove('kv-ghost');
          var check = ghost.querySelector('.kv-check');
          check.disabled = false;
          check.checked = true;
          appendGhostRow(table, kind);
        });
      });

      table.appendChild(ghost);
    }

    function onParamsChanged() {
      syncUrl();
      updateDots();
    }

    /** Rebuilds the URL bar from the params table — the Postman behaviour. */
    function syncUrl() {
      if (!current) return;
      var url = current.path;
      var query = [];

      document.querySelectorAll('#params-table .kv-row').forEach(function (row) {
        if (row.classList.contains('kv-header-row')) return;
        var check = row.querySelector('.kv-check');
        if (!check || !check.checked) return;

        var kind = row.getAttribute('data-kind');
        var name = row.getAttribute('data-name');
        var value;
        if (name) {
          value = row.querySelector('.kv-input').value;
        } else {
          var keyInput = row.querySelector('.kv-custom-key');
          var valueInput = row.querySelector('.kv-custom-value');
          if (!keyInput || !keyInput.value) return;
          name = keyInput.value;
          value = valueInput ? valueInput.value : '';
          kind = 'query';
        }

        if (kind === 'path') {
          if (value) url = url.replace('{' + name + '}', encodeURIComponent(value));
        } else if (value !== '') {
          query.push(encodeURIComponent(name) + '=' + encodeURIComponent(value));
        }
      });

      byId('url-input').value = url + (query.length ? '?' + query.join('&') : '');
    }

    function updateDots() {
      var hasValue = false;
      document.querySelectorAll('#params-table .kv-input').forEach(function (input) {
        if (input.value) hasValue = true;
      });
      byId('dot-params').hidden = !hasValue;
    }

    byId('panel-params').addEventListener('input', onParamsChanged);
    byId('panel-params').addEventListener('change', onParamsChanged);

    /* ---- Auth panel (per request, inherits from global) ---- */

    function localAuth() {
      return reqAuth[current.id] || { mode: 'inherit', token: '', header: '' };
    }

    function effectiveAuth() {
      var local = localAuth();
      if (local.mode !== 'inherit') return local;
      var g = getAuth();
      if (g.type === 'bearer' || g.type === 'apikey') {
        return { mode: g.type, token: g.token || '', header: g.header || '' };
      }
      return { mode: 'none' };
    }

    function applyEffectiveAuth(headers) {
      var auth = effectiveAuth();
      var token = (auth.token || '').trim();
      if (auth.mode === 'bearer' && token) headers['Authorization'] = 'Bearer ' + token;
      if (auth.mode === 'apikey' && token) headers[(auth.header || 'X-API-Key').trim()] = token;
      return headers;
    }

    function renderAuthPanel() {
      var local = localAuth();
      var effective = effectiveAuth();
      var panel = byId('panel-auth');

      var preview = (effective.token || '').trim();
      preview = preview ? esc(preview.length > 14 ? preview.slice(0, 14) + '…' : preview) : '(empty)';
      var summary = effective.mode === 'none'
        ? '<span class="dim">No authorization will be sent.</span>'
        : effective.mode === 'bearer'
          ? '<span class="chip chip-auth">Authorization: Bearer ' + preview + '</span>'
          : '<span class="chip chip-auth">' + esc(effective.header || 'X-API-Key') + ': ' + preview + '</span>';

      panel.innerHTML =
        '<div class="auth-grid">' +
          '<label class="auth-field"><span>Auth type</span>' +
            '<select id="req-auth-mode">' +
              '<option value="inherit"' + (local.mode === 'inherit' ? ' selected' : '') + '>Inherit from global 🔑</option>' +
              '<option value="none"' + (local.mode === 'none' ? ' selected' : '') + '>No auth</option>' +
              '<option value="bearer"' + (local.mode === 'bearer' ? ' selected' : '') + '>Bearer token</option>' +
              '<option value="apikey"' + (local.mode === 'apikey' ? ' selected' : '') + '>API key header</option>' +
            '</select>' +
          '</label>' +
          '<label class="auth-field" id="req-auth-header-row"' + (local.mode === 'apikey' ? '' : ' hidden') + '><span>Header</span>' +
            '<input id="req-auth-header" placeholder="X-API-Key" value="' + esc(local.header || '') + '" />' +
          '</label>' +
          '<label class="auth-field" id="req-auth-token-row"' + (local.mode === 'bearer' || local.mode === 'apikey' ? '' : ' hidden') + '><span>Value</span>' +
            '<input id="req-auth-token" placeholder="token…" value="' + esc(local.token || '') + '" />' +
          '</label>' +
        '</div>' +
        '<div class="auth-summary">Effective: ' + summary + '</div>';

      function persist() {
        reqAuth[current.id] = {
          mode: byId('req-auth-mode').value,
          token: byId('req-auth-token') ? byId('req-auth-token').value : '',
          header: byId('req-auth-header') ? byId('req-auth-header').value : '',
        };
        renderAuthPanel();
        renderHeadersPanel();
      }

      byId('req-auth-mode').addEventListener('change', persist);
      byId('req-auth-token').addEventListener('input', function () {
        reqAuth[current.id] = { mode: byId('req-auth-mode').value, token: this.value, header: byId('req-auth-header').value };
        byId('dot-auth').hidden = !this.value;
      });
      byId('req-auth-token').addEventListener('change', function () {
        renderAuthPanel();
        renderHeadersPanel();
      });
      byId('req-auth-header').addEventListener('input', function () {
        reqAuth[current.id] = { mode: byId('req-auth-mode').value, token: byId('req-auth-token').value, header: this.value };
      });

      byId('dot-auth').hidden = localAuth().mode === 'inherit' || localAuth().mode === 'none';
    }

    /* ---- Headers panel: auto rows + spec rows + ghost rows ---- */

    function renderHeadersPanel() {
      if (!current) return;
      var body = bodyInfo(current.op);
      var headers = (current.op.parameters || []).filter(function (p) { return p.in === 'header'; });
      var panel = byId('panel-headers');
      var auth = effectiveAuth();

      var autoRows = '';
      var autoCount = 0;
      if (bodyMode === 'raw' && body.contentType) {
        autoCount++;
        autoRows += '<div class="kv-row kv-auto">' + checkCell(true, true) +
          '<span class="kv-key">Content-Type</span>' +
          '<span class="kv-fixed">' + esc(body.contentType) + '</span>' +
          '<span class="kv-desc">auto — from request body</span></div>';
      }
      if (auth.mode === 'bearer' && auth.token) {
        autoCount++;
        autoRows += '<div class="kv-row kv-auto">' + checkCell(true, true) +
          '<span class="kv-key">Authorization</span>' +
          '<span class="kv-fixed">Bearer ' + esc(auth.token.length > 18 ? auth.token.slice(0, 18) + '…' : auth.token) + '</span>' +
          '<span class="kv-desc">auto — from Auth tab</span></div>';
      }
      if (auth.mode === 'apikey' && auth.token) {
        autoCount++;
        autoRows += '<div class="kv-row kv-auto">' + checkCell(true, true) +
          '<span class="kv-key">' + esc(auth.header || 'X-API-Key') + '</span>' +
          '<span class="kv-fixed">' + esc(auth.token.length > 18 ? auth.token.slice(0, 18) + '…' : auth.token) + '</span>' +
          '<span class="kv-desc">auto — from Auth tab</span></div>';
      }

      var specRows = headers.map(function (prm) {
        return '<div class="kv-row" data-kind="header" data-name="' + esc(prm.name) + '">' +
          checkCell(true, false) +
          '<span class="kv-key">' + esc(prm.name) + (prm.required ? '<i class="req">*</i>' : '') + '</span>' +
          '<input class="kv-input" placeholder="' + esc(typeLabel(prm.schema || {}) || 'value') + '" />' +
          '<span class="kv-desc">' + esc(prm.description || '') + '</span>' +
        '</div>';
      }).join('');

      var countEl = byId('count-headers');
      var total = autoCount + headers.length;
      countEl.hidden = total === 0;
      countEl.textContent = total;

      panel.innerHTML =
        (autoCount ? '<div class="hidden-note dim">' + autoCount + ' auto-generated</div>' : '') +
        '<div class="kv-table" id="headers-table">' +
        '<div class="kv-row kv-header-row">' +
          '<span class="kv-check-cell"></span>' +
          '<span class="kv-head">Key</span><span class="kv-head">Value</span><span class="kv-head">Description</span>' +
        '</div>' +
        autoRows + specRows +
      '</div>';

      appendGhostRow(byId('headers-table'), 'header');
    }

    /* ---- Body panel: mode selector (none / raw JSON) ---- */

    function renderBodyPanel(body) {
      var panel = byId('panel-body');
      var rawChecked = bodyMode === 'raw' ? ' checked' : '';
      var noneChecked = bodyMode === 'none' ? ' checked' : '';

      panel.innerHTML =
        '<div class="body-bar">' +
          '<label class="body-mode"><input type="radio" name="body-mode" value="none"' + noneChecked + ' /> none</label>' +
          '<label class="body-mode"><input type="radio" name="body-mode" value="raw"' + rawChecked + ' /> raw</label>' +
          '<select class="raw-lang" id="raw-lang"' + (bodyMode === 'raw' ? '' : ' hidden') + '><option>JSON</option></select>' +
          '<span class="chip">' + esc(body.contentType || 'application/json') + '</span>' +
          '<span class="chip" id="json-valid" hidden></span>' +
          '<button type="button" class="btn-add" id="beautify-body"' + (bodyMode === 'raw' ? '' : ' hidden') + '>Beautify</button>' +
        '</div>' +
        '<textarea class="body-editor" id="body-editor" rows="12" spellcheck="false"' + (bodyMode === 'raw' ? '' : ' hidden') + '>' +
          esc(body.example !== null ? JSON.stringify(body.example, null, 2) : '') +
        '</textarea>' +
        (bodyMode === 'none' ? '<div class="panel-empty" id="body-none-note">This request has no body.</div>' : '');

      panel.querySelectorAll('input[name=body-mode]').forEach(function (radio) {
        radio.addEventListener('change', function () {
          bodyMode = this.value;
          byId('body-editor').hidden = bodyMode !== 'raw';
          byId('beautify-body').hidden = bodyMode !== 'raw';
          byId('raw-lang').hidden = bodyMode !== 'raw';
          var note = byId('body-none-note');
          if (note) note.hidden = bodyMode !== 'none';
          validateBody();
          renderHeadersPanel();
        });
      });

      byId('beautify-body').addEventListener('click', function () {
        var editor = byId('body-editor');
        try { editor.value = JSON.stringify(JSON.parse(editor.value), null, 2); } catch (e) { /* leave as-is */ }
        validateBody();
      });

      byId('body-editor').addEventListener('input', validateBody);
      validateBody();
    }

    /** Live JSON validity badge for the raw body editor. */
    function validateBody() {
      var badge = byId('json-valid');
      var editor = byId('body-editor');
      if (!badge || !editor) return;
      var text = editor.value.trim();
      if (bodyMode !== 'raw' || !text) { badge.hidden = true; return; }
      badge.hidden = false;
      try {
        JSON.parse(text);
        badge.className = 'chip chip-ok';
        badge.textContent = 'JSON ✓';
      } catch (e) {
        badge.className = 'chip chip-err';
        badge.textContent = 'Invalid JSON';
      }
    }

    function renderDocsPanel(item, body) {
      var op = item.op;
      var html = '';

      if (op.description) html += '<p class="dim">' + esc(op.description) + '</p>';

      if (body.schema) {
        var tree = schemaTree(body.schema, 0);
        if (tree) html += '<h4>Request body schema</h4><div class="schema">' + tree + '</div>';
      }

      var responses = op.responses || {};
      var codes = Object.keys(responses);
      if (codes.length) {
        html += '<h4>Responses</h4>';
        html += codes.map(function (code) {
          var r = responses[code] || {};
          var cls = code[0] === '2' ? 'ok' : code[0] === '4' || code[0] === '5' ? 'err' : 'other';
          var block = '';
          if (r.content && r.content['application/json']) {
            var example = exampleOf(r.content['application/json'].schema || {}, 0);
            if (example !== null) {
              block = '<pre class="code">' + hljson(JSON.stringify(example, null, 2)) + '</pre>';
            }
          }
          return '<div class="response-doc"><span class="status status-' + cls + '">' + esc(code) + '</span>' +
            '<span class="dim">' + esc(r.description || '') + '</span>' + block + '</div>';
        }).join('');
      }

      byId('panel-docs').innerHTML = html || '<div class="panel-empty">No additional documentation.</div>';
    }

    /* ------------------------------------------------------------------ *
     * Tabs
     * ------------------------------------------------------------------ */

    function activateTab(name) {
      document.querySelectorAll('.tab').forEach(function (tab) {
        tab.classList.toggle('active', tab.getAttribute('data-tab') === name);
      });
      document.querySelectorAll('.panel').forEach(function (panel) {
        panel.hidden = panel.getAttribute('data-panel') !== name;
      });
      if (name === 'code') renderCodePanel();
    }

    byId('tabs').addEventListener('click', function (event) {
      var tab = event.target.closest('.tab');
      if (tab) activateTab(tab.getAttribute('data-tab'));
    });

    /* ------------------------------------------------------------------ *
     * Request assembly (shared by Send and the Code tab)
     * ------------------------------------------------------------------ */

    function collectRequest() {
      var headers = {};

      document.querySelectorAll('#headers-table .kv-row').forEach(function (row) {
        if (row.classList.contains('kv-header-row') || row.classList.contains('kv-auto')) return;
        var check = row.querySelector('.kv-check');
        if (!check || !check.checked) return;
        var name = row.getAttribute('data-name');
        if (name) {
          var input = row.querySelector('.kv-input');
          if (input && input.value) headers[name] = input.value;
        } else {
          var keyInput = row.querySelector('.kv-custom-key');
          var valueInput = row.querySelector('.kv-custom-value');
          if (keyInput && keyInput.value && valueInput && valueInput.value) {
            headers[keyInput.value] = valueInput.value;
          }
        }
      });

      applyEffectiveAuth(headers);

      var body = null;
      var bodyEditor = byId('body-editor');
      if (bodyMode === 'raw' && bodyEditor && !bodyEditor.hidden && bodyEditor.value.trim()) {
        body = bodyEditor.value;
        headers['Content-Type'] = bodyInfo(current.op).contentType || 'application/json';
      }

      // Relative URLs are fetched against the page origin, which is always
      // the app serving these docs — works behind proxies and tunnels too.
      // An active environment can override the base URL and fill variables.
      var url = applyVars(byId('url-input').value);
      var env = activeEnv();
      if (env && env.baseUrl && url.indexOf('http') !== 0) {
        url = env.baseUrl.replace(/\\/+$/, '') + url;
      }
      Object.keys(headers).forEach(function (key) { headers[key] = applyVars(headers[key]); });
      if (body) body = applyVars(body);
      return { url: url, headers: headers, body: body };
    }

    /* ------------------------------------------------------------------ *
     * Code snippets (cURL / fetch / axios)
     * ------------------------------------------------------------------ */

    function absolute(url) {
      if (url.indexOf('http') === 0) return url;
      var env = activeEnv();
      var base = (env && env.baseUrl) ||
        (spec && spec.servers && spec.servers[0] && spec.servers[0].url) || location.origin;
      if (base.charAt(base.length - 1) === '/') base = base.slice(0, -1);
      return base + url;
    }

    function snippetCurl(req, method) {
      var lines = ["curl -X " + method + " '" + absolute(req.url) + "'"];
      Object.keys(req.headers).forEach(function (key) {
        lines.push("  -H '" + key + ": " + req.headers[key] + "'");
      });
      if (req.body) {
        lines.push("  -d '" + req.body.replace(/'/g, "'\\\\''") + "'");
      }
      return lines.join(' \\\\\\n');
    }

    function snippetFetch(req, method) {
      var opts = { method: method };
      if (Object.keys(req.headers).length) opts.headers = req.headers;
      var optsJson = JSON.stringify(opts, null, 2);
      if (req.body) {
        optsJson = optsJson.replace(/\\n}$/, ',\\n  "body": JSON.stringify(' + req.body.replace(/\\n/g, '\\n  ') + ')\\n}');
      }
      return "const response = await fetch('" + absolute(req.url) + "', " + optsJson + ');\\n' +
        'const data = await response.json();\\nconsole.log(data);';
    }

    function snippetAxios(req, method) {
      var config = '';
      if (Object.keys(req.headers).length) {
        config = ', {\\n  headers: ' + JSON.stringify(req.headers, null, 2).replace(/\\n/g, '\\n  ') + '\\n}';
      }
      var dataArg = req.body ? ', ' + req.body.replace(/\\n/g, '\\n') : '';
      var m = method.toLowerCase();
      if (m === 'get' || m === 'delete' || m === 'head' || m === 'options') {
        return "const { data } = await axios." + m + "('" + absolute(req.url) + "'" + config + ');\\nconsole.log(data);';
      }
      return "const { data } = await axios." + m + "('" + absolute(req.url) + "'" + dataArg + config + ');\\nconsole.log(data);';
    }

    function renderCodePanel() {
      if (!current) return;
      var req = collectRequest();
      var method = current.method.toUpperCase();
      var lang = byId('code-lang').value;
      var text = lang === 'curl' ? snippetCurl(req, method)
        : lang === 'fetch' ? snippetFetch(req, method)
        : snippetAxios(req, method);
      byId('code-snippet').textContent = text;
    }

    byId('code-lang').addEventListener('change', renderCodePanel);
    byId('copy-code').addEventListener('click', function () {
      copyText(byId('code-snippet').textContent, byId('copy-code'));
    });

    /* ------------------------------------------------------------------ *
     * Send + response viewer
     * ------------------------------------------------------------------ */

    var lastResponseText = '';

    function resetResponse() {
      byId('resp-meta').innerHTML = '';
      byId('resp-body').innerHTML = '<div class="resp-empty">Hit <b>Send</b> to see the response here.</div>';
      byId('resp-headers').innerHTML = '';
      byId('copy-resp').hidden = true;
      byId('dl-resp').hidden = true;
      lastResponseText = '';
      activateRespTab('body');
    }

    function activateRespTab(name) {
      document.querySelectorAll('.rtab').forEach(function (tab) {
        tab.classList.toggle('active', tab.getAttribute('data-rtab') === name);
      });
      document.querySelectorAll('.resp-panel').forEach(function (panel) {
        panel.hidden = panel.getAttribute('data-rpanel') !== name;
      });
    }

    document.querySelectorAll('.rtab').forEach(function (tab) {
      tab.addEventListener('click', function () { activateRespTab(tab.getAttribute('data-rtab')); });
    });

    byId('copy-resp').addEventListener('click', function () {
      copyText(lastResponseText, byId('copy-resp'));
    });

    byId('dl-resp').addEventListener('click', function () {
      var blob = new Blob([lastResponseText], { type: 'application/json' });
      var link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'response.json';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    });

    function formatSize(bytes) {
      if (bytes < 1024) return bytes + ' B';
      return (bytes / 1024).toFixed(1) + ' KB';
    }

    function send() {
      if (!current) return;
      var req = collectRequest();
      var init = { method: current.method.toUpperCase(), headers: req.headers };
      if (req.body) init.body = req.body;

      var metaEl = byId('resp-meta');
      var bodyEl = byId('resp-body');
      metaEl.innerHTML = '<span class="dim">Sending…</span>';
      bodyEl.innerHTML = '';
      var started = performance.now();
      var sendBtn = byId('send-btn');
      sendBtn.classList.add('loading');
      sendBtn.textContent = 'Sending';
      function restoreSend() {
        sendBtn.classList.remove('loading');
        sendBtn.textContent = 'Send';
      }

      fetch(req.url, init).then(function (res) {
        return res.text().then(function (text) {
          restoreSend();
          var ms = Math.round(performance.now() - started);
          var pretty = text;
          var isJson = false;
          try { pretty = JSON.stringify(JSON.parse(text), null, 2); isJson = true; } catch (e) { /* not JSON */ }
          lastResponseText = pretty;
          var cls = res.ok ? 'ok' : 'err';
          metaEl.innerHTML =
            '<span class="status status-' + cls + '">' + res.status + ' ' + esc(res.statusText) + '</span>' +
            '<span class="meta-item">' + ms + ' ms</span>' +
            '<span class="meta-item">' + formatSize(text.length) + '</span>';
          bodyEl.innerHTML = '<pre class="code resp-code">' + (isJson ? hljson(pretty) : esc(pretty)) + '</pre>';

          var headerRows = '';
          res.headers.forEach(function (value, key) {
            headerRows += '<div class="kv-row"><span class="kv-key">' + esc(key) + '</span>' +
              '<span class="kv-fixed">' + esc(value) + '</span></div>';
          });
          byId('resp-headers').innerHTML = headerRows
            ? '<div class="kv-table kv-resp">' + headerRows + '</div>'
            : '<div class="resp-empty">No headers exposed.</div>';

          byId('copy-resp').hidden = false;
          byId('dl-resp').hidden = false;
          pushHistory({
            opId: current.id, method: current.method, url: req.url,
            status: res.status, ms: ms, at: new Date().toLocaleTimeString(),
          });
        });
      }).catch(function (err) {
        restoreSend();
        var ms = Math.round(performance.now() - started);
        metaEl.innerHTML = '<span class="status status-err">failed</span>';
        bodyEl.innerHTML = '<pre class="code resp-code">' + esc(String(err)) + '</pre>';
        pushHistory({
          opId: current.id, method: current.method, url: req.url,
          status: 0, ms: ms, at: new Date().toLocaleTimeString(),
        });
      });
    }

    byId('send-btn').addEventListener('click', send);
    document.addEventListener('keydown', function (event) {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') send();
    });

    /* ------------------------------------------------------------------ *
     * Share links — request state encoded in the URL hash, no server needed
     * ------------------------------------------------------------------ */

    function encodeShare(state) {
      return btoa(unescape(encodeURIComponent(JSON.stringify(state))))
        .replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/g, '');
    }

    function decodeShare(encoded) {
      try {
        var b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
        return JSON.parse(decodeURIComponent(escape(atob(b64))));
      } catch (e) { return null; }
    }

    /** Restores a teammate's shared request state after the op is selected. */
    function applyShared(state) {
      if (state.u) byId('url-input').value = state.u;
      if (state.b) {
        var editor = byId('body-editor');
        if (editor) {
          bodyMode = 'raw';
          var raw = document.querySelector('#panel-body input[value=raw]');
          if (raw) raw.checked = true;
          editor.hidden = false;
          editor.value = state.b;
          validateBody();
          renderHeadersPanel();
        }
      }
    }

    byId('share-btn').addEventListener('click', function () {
      if (!current) return;
      var state = { u: byId('url-input').value };
      var editor = byId('body-editor');
      if (bodyMode === 'raw' && editor && editor.value.trim()) state.b = editor.value;
      var link = location.origin + location.pathname + '#' + current.id + '!' + encodeShare(state);
      copyText(link, byId('share-btn'));
    });

    /* ------------------------------------------------------------------ *
     * Export as Postman Collection v2.1
     * ------------------------------------------------------------------ */

    function exportPostman() {
      if (!spec) return;
      var info = spec.info || {};
      var collection = {
        info: {
          name: info.title || 'API',
          description: info.description || '',
          schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        },
        variable: [{ key: 'baseUrl', value: absolute(baseUrl() || '') }],
        item: [],
      };

      Object.keys(groupsCache).sort().forEach(function (tag) {
        var folder = { name: tag, item: [] };
        groupsCache[tag].forEach(function (item) {
          var body = bodyInfo(item.op);
          var pmPath = item.path.replace(/\\{([^}]+)\\}/g, ':$1');
          var request = {
            method: item.method.toUpperCase(),
            header: [],
            url: {
              raw: '{{baseUrl}}' + pmPath,
              host: ['{{baseUrl}}'],
              path: pmPath.split('/').filter(Boolean),
            },
            description: item.op.description || item.op.summary || '',
          };

          var params = item.op.parameters || [];
          var query = params.filter(function (p) { return p.in === 'query'; });
          var pathVars = params.filter(function (p) { return p.in === 'path'; });
          if (query.length) {
            request.url.query = query.map(function (p) {
              return { key: p.name, value: '', description: p.description || '' };
            });
          }
          if (pathVars.length) {
            request.url.variable = pathVars.map(function (p) {
              return { key: p.name, value: '', description: p.description || '' };
            });
          }
          if (body.contentType) {
            request.header.push({ key: 'Content-Type', value: body.contentType });
            if (body.example !== null) {
              request.body = {
                mode: 'raw',
                raw: JSON.stringify(body.example, null, 2),
                options: { raw: { language: 'json' } },
              };
            }
          }

          folder.item.push({ name: item.op.summary || item.path, request: request });
        });
        collection.item.push(folder);
      });

      var blob = new Blob([JSON.stringify(collection, null, 2)], { type: 'application/json' });
      var link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = (info.title || 'api').replace(/[^a-zA-Z0-9-_]+/g, '-') + '.postman_collection.json';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    }

    byId('export-postman').addEventListener('click', exportPostman);

    /* ------------------------------------------------------------------ *
     * WebSockets — gateway docs + live console (Socket.IO / raw WS)
     * ------------------------------------------------------------------ */

    var wsDoc = null;
    var wsConn = null;

    function wsUrlFor(gateway) {
      var origin = location.origin;
      if (gateway.port) {
        origin = location.protocol + '//' + location.hostname + ':' + gateway.port;
      }
      return origin + (gateway.namespace || '');
    }

    function setWsStatus(state) {
      var chip = byId('ws-status');
      chip.textContent = state;
      chip.className = 'chip ' + (state === 'connected' ? 'chip-ok' : state === 'error' ? 'chip-err' : '');
      byId('ws-send').disabled = state !== 'connected';
      byId('ws-connect').textContent = state === 'connected' ? 'Disconnect' : 'Connect';
    }

    function wsLog(direction, name, data) {
      var log = byId('ws-log');
      var empty = log.querySelector('.resp-empty');
      if (empty) empty.remove();

      var arrow = direction === 'in' ? '▼' : direction === 'out' ? '▲' : '●';
      var body = '';
      if (data !== undefined && data !== null && data !== '') {
        var text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
        body = '<pre class="code ws-log-data">' + hljson(text) + '</pre>';
      }
      var row = el('<div class="ws-log-row">' +
        '<span class="ws-dir ws-dir-' + direction + '">' + arrow + '</span>' +
        '<span class="ws-log-name">' + esc(name) + '</span>' +
        '<span class="ws-log-time dim">' + new Date().toLocaleTimeString() + '</span>' +
        body +
      '</div>');
      log.insertBefore(row, log.firstChild);
      while (log.children.length > 100) log.removeChild(log.lastChild);
    }

    function loadSocketIo(callback) {
      if (window.io) return callback(window.io);
      // Served by the user's own Socket.IO server — no CDN involved.
      var script = document.createElement('script');
      script.src = '/socket.io/socket.io.js';
      script.onload = function () { callback(window.io || null); };
      script.onerror = function () { callback(null); };
      document.head.appendChild(script);
    }

    function wsDisconnect() {
      if (!wsConn) return;
      try {
        if (wsConn.kind === 'socketio') wsConn.socket.disconnect();
        else wsConn.socket.close();
      } catch (e) { /* already closed */ }
      wsConn = null;
      setWsStatus('disconnected');
    }

    function wsConnect() {
      var url = byId('ws-url').value;
      var transport = byId('ws-transport').value;
      setWsStatus('connecting…');

      if (transport === 'ws') {
        var wsUrl = url.replace(/^http/, 'ws');
        var socket;
        try {
          socket = new WebSocket(wsUrl);
        } catch (e) {
          setWsStatus('error');
          wsLog('sys', 'error', String(e));
          return;
        }
        wsConn = { kind: 'ws', socket: socket };
        socket.onopen = function () { setWsStatus('connected'); wsLog('sys', 'connected', wsUrl); };
        socket.onclose = function () { if (wsConn && wsConn.socket === socket) { wsConn = null; } setWsStatus('disconnected'); };
        socket.onerror = function () { setWsStatus('error'); wsLog('sys', 'error', 'WebSocket error — is the gateway using the ws adapter?'); };
        socket.onmessage = function (event) {
          var data = event.data;
          try { data = JSON.parse(event.data); } catch (e) { /* keep raw */ }
          wsLog('in', (data && data.event) || 'message', data);
        };
        return;
      }

      loadSocketIo(function (io) {
        if (!io) {
          setWsStatus('error');
          wsLog('sys', 'error', 'Could not load /socket.io/socket.io.js from this server. Raw WebSocket may work instead.');
          return;
        }
        var socket = io(url, { transports: ['websocket', 'polling'] });
        wsConn = { kind: 'socketio', socket: socket };
        socket.on('connect', function () { setWsStatus('connected'); wsLog('sys', 'connected', 'id: ' + socket.id); });
        socket.on('disconnect', function (reason) { setWsStatus('disconnected'); wsLog('sys', 'disconnected', reason); });
        socket.on('connect_error', function (err) { setWsStatus('error'); wsLog('sys', 'connect_error', String(err && err.message || err)); });
        if (socket.onAny) {
          socket.onAny(function (eventName) {
            var args = [].slice.call(arguments, 1);
            wsLog('in', eventName, args.length === 1 ? args[0] : args);
          });
        }
      });
    }

    byId('ws-connect').addEventListener('click', function () {
      if (wsConn) wsDisconnect();
      else wsConnect();
    });

    byId('ws-send').addEventListener('click', function () {
      if (!wsConn) return;
      var name = byId('ws-event-name').value.trim();
      if (!name) return;
      var text = byId('ws-payload').value.trim();
      var data = null;
      if (text) {
        try { data = JSON.parse(text); } catch (e) { data = text; }
      }

      if (wsConn.kind === 'socketio') {
        wsConn.socket.emit(name, data, function (ack) { wsLog('in', name + ' · ack', ack); });
      } else {
        wsConn.socket.send(JSON.stringify({ event: name, data: data }));
      }
      wsLog('out', name, data);
    });

    byId('ws-clear').addEventListener('click', function () {
      byId('ws-log').innerHTML = '<div class="resp-empty">Connect and send an event to see live traffic here.</div>';
    });

    byId('ws-crumb-overview').addEventListener('click', showOverview);

    function showWsView(gateway, wsEvent, navEl) {
      current = null;
      byId('welcome').hidden = true;
      byId('request-view').hidden = true;
      byId('ws-view').hidden = false;

      byId('overview-link').classList.remove('active');
      var active = document.querySelector('.nav-item.active');
      if (active) active.classList.remove('active');
      if (navEl) navEl.classList.add('active');

      byId('ws-crumb-gateway').textContent = gateway.name;
      byId('ws-crumb-event').textContent = wsEvent.event;
      byId('ws-url').value = wsUrlFor(gateway);
      byId('ws-event-name').value = wsEvent.event;
      byId('ws-summary').textContent = wsEvent.summary || '';

      var example = wsEvent.payload && Object.keys(wsEvent.payload).length
        ? exampleOf(wsEvent.payload, 0) : null;
      byId('ws-payload').value = example !== null ? JSON.stringify(example, null, 2) : '';

      var doc = '';
      if (wsEvent.description) doc += '<p class="dim">' + esc(wsEvent.description) + '</p>';
      var payloadTree = wsEvent.payload ? schemaTree(wsEvent.payload, 0) : '';
      if (payloadTree) doc += '<h4>Payload schema</h4><div class="schema">' + payloadTree + '</div>';
      var responseTree = wsEvent.response ? schemaTree(wsEvent.response, 0) : '';
      if (responseTree) doc += '<h4>Response schema</h4><div class="schema">' + responseTree + '</div>';
      byId('ws-doc').innerHTML = doc;
    }

    function renderWsSidebar() {
      var nav = byId('side-collections');
      wsDoc.gateways.forEach(function (gateway) {
        var group = el('<div class="group">' +
          '<button type="button" class="group-head">' +
            '<span class="chev">▸</span>' +
            '<span class="group-name">🔌 ' + esc(gateway.name) + '</span>' +
            '<span class="group-count">' + gateway.events.length + '</span>' +
          '</button>' +
          '<div class="group-items"></div>' +
        '</div>');

        group.querySelector('.group-head').addEventListener('click', function () {
          group.classList.toggle('open');
        });

        var itemsEl = group.querySelector('.group-items');
        gateway.events.forEach(function (wsEvent) {
          var a = el('<button type="button" class="nav-item">' +
            '<span class="method method-sm method-ws">WS</span>' +
            '<span class="nav-text">' +
              '<span class="nav-name">' + esc(wsEvent.summary || wsEvent.event) + '</span>' +
              '<span class="nav-path">' + esc(wsEvent.event) + '</span>' +
            '</span>' +
          '</button>');
          a.setAttribute('data-search', ('ws ' + wsEvent.event + ' ' + (wsEvent.summary || '') + ' ' + gateway.name).toLowerCase());
          a.addEventListener('click', function () { showWsView(gateway, wsEvent, a); });
          itemsEl.appendChild(a);
        });

        nav.appendChild(group);
      });
    }

    /* ------------------------------------------------------------------ *
     * Search
     * ------------------------------------------------------------------ */

    byId('search').addEventListener('input', function (event) {
      var q = event.target.value.toLowerCase().trim();
      document.querySelectorAll('.group').forEach(function (group) {
        var visible = 0;
        group.querySelectorAll('.nav-item').forEach(function (item) {
          var match = !q || item.getAttribute('data-search').indexOf(q) !== -1;
          item.style.display = match ? '' : 'none';
          if (match) visible++;
        });
        group.style.display = visible ? '' : 'none';
        if (q && visible) group.classList.add('open');
      });
    });

    /* ------------------------------------------------------------------ *
     * Boot
     * ------------------------------------------------------------------ */

    renderHistory();

    fetch(SPEC_URL).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (doc) {
      spec = doc;
      var info = spec.info || {};
      if (info.title) {
        byId('api-title').textContent = info.title;
        byId('welcome-title').textContent = info.title;
        document.title = info.title;
      }
      if (info.version) {
        var chip = byId('api-version');
        chip.textContent = 'v' + info.version;
        chip.hidden = false;
      }
      if (info.description) byId('welcome-desc').textContent = info.description;

      var groups = collectOperations();
      renderOverview(groups);
      renderSidebar(groups);

      var hash = location.hash.slice(1);
      var bang = hash.indexOf('!');
      var opKey = bang === -1 ? hash : hash.slice(0, bang);
      var sharedState = bang === -1 ? null : decodeShare(hash.slice(bang + 1));
      var fromHash = opKey && opsById[opKey];
      if (fromHash) {
        selectOperation(fromHash);
        if (sharedState) applyShared(sharedState);
      }

      // WebSocket gateway docs are optional — hide the section when absent.
      fetch(SPEC_URL.replace('-json', '-ws-json')).then(function (res) {
        return res.ok ? res.json() : null;
      }).then(function (doc) {
        if (doc && doc.gateways && doc.gateways.length) {
          wsDoc = doc;
          renderWsSidebar();
        }
      }).catch(function () { /* endpoint not available */ });
    }).catch(function (err) {
      byId('welcome-desc').textContent = 'Failed to load ' + SPEC_URL + ' — ' + String(err);
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
      --bg: #ffffff; --bg-2: #f6f8fa; --bg-3: #eaeef3;
      --fg: #1a2130; --fg-2: rgba(26, 33, 48, 0.72); --fg-3: rgba(26, 33, 48, 0.48);
      --border: rgba(26, 33, 48, 0.12); --shadow: rgba(20, 24, 36, 0.06);
    }
    [data-theme='dark'] {
      --bg: #14181f; --bg-2: #1b212b; --bg-3: #242c38;
      --fg: rgba(240, 245, 252, 0.94); --fg-2: rgba(214, 224, 238, 0.72); --fg-3: rgba(190, 203, 222, 0.45);
      --border: rgba(214, 226, 242, 0.1); --shadow: rgba(0, 0, 0, 0.28);
    }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    body {
      margin: 0; background: var(--bg); color: var(--fg);
      font-family: var(--font); font-size: 14px; line-height: 1.55;
      -webkit-font-smoothing: antialiased;
    }
    .mono, code, pre { font-family: var(--mono); }
    .dim { color: var(--fg-2); }
    h4 { margin: 18px 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.6px; color: var(--fg-3); }

    /* ---- Polish: selection, scrollbars, motion, focus ---- */
    ::selection { background: ${accent}55; }
    ::-webkit-scrollbar { width: 10px; height: 10px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--bg-3); border-radius: 8px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--fg-3); }
    button { transition: color 0.15s, background 0.15s, border-color 0.15s, transform 0.1s; }
    :focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; border-radius: 4px; }
    .panel, .resp-panel, .welcome-inner { animation: rise 0.18s ease; }
    @keyframes rise { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
    .btn-send:active { transform: scale(0.97); }
    .btn-send.loading { opacity: 0.75; pointer-events: none; }
    .btn-send.loading::after {
      content: ''; display: inline-block; width: 11px; height: 11px; margin-left: 8px;
      border: 2px solid rgba(255, 255, 255, 0.5); border-top-color: #fff; border-radius: 50%;
      animation: spin 0.7s linear infinite; vertical-align: -1px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .j-key { color: var(--accent); }
    .j-str { color: #3fb950; }
    .j-num { color: #d29922; }
    .j-bool { color: #a371f7; }
    .chip-ok { background: #3fb95022; color: #3fb950; }
    .chip-err { background: #f8514922; color: #f85149; }
    .raw-lang {
      padding: 3px 8px; border-radius: 7px; border: 1px solid var(--border);
      background: var(--bg-2); color: var(--accent); font-family: var(--mono); font-size: 11.5px;
      font-weight: 700; outline: none; cursor: pointer;
    }

    /* ---- Top bar ---- */
    .topbar {
      position: sticky; top: 0; z-index: 10; height: 52px;
      display: flex; align-items: center; justify-content: space-between; gap: 16px;
      padding: 0 16px; background: var(--bg); border-bottom: 1px solid var(--border);
    }
    .brand { display: flex; align-items: center; gap: 10px; min-width: 0; cursor: pointer; }
    .brand-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--accent); flex: none; }
    .brand-title { font-weight: 700; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .topbar-actions { display: flex; align-items: center; gap: 8px; }
    .search {
      width: 210px; padding: 7px 12px; border-radius: 8px;
      border: 1px solid var(--border); background: var(--bg-2); color: var(--fg);
      font-size: 13px; outline: none;
    }
    .search:focus { border-color: var(--accent); }
    .btn-ghost {
      padding: 7px 12px; border-radius: 8px; border: 1px solid var(--border);
      background: transparent; color: var(--fg-2); font-size: 13px;
      cursor: pointer; text-decoration: none; white-space: nowrap;
      font-family: var(--font);
    }
    .btn-ghost:hover { color: var(--fg); border-color: var(--accent); }
    .btn-ghost.auth-on { color: var(--accent); border-color: var(--accent); }

    /* ---- Auth popover ---- */
    .auth-pop {
      position: absolute; top: 56px; right: 16px; z-index: 20; width: 320px;
      background: var(--bg); border: 1px solid var(--border); border-radius: 12px;
      box-shadow: 0 8px 30px var(--shadow); padding: 14px 16px;
    }
    .auth-title { font-weight: 700; font-size: 13px; margin-bottom: 10px; }
    .auth-title .dim { font-weight: 400; font-size: 11.5px; }
    .auth-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; font-size: 12px; color: var(--fg-2); }
    .auth-field input, .auth-field select {
      padding: 7px 10px; border-radius: 8px; border: 1px solid var(--border);
      background: var(--bg-2); color: var(--fg); font-family: var(--mono); font-size: 12.5px; outline: none;
    }
    .auth-field input:focus, .auth-field select:focus { border-color: var(--accent); }
    .auth-note { font-size: 11px; }

    /* ---- WebSocket console ---- */
    .method-ws { background: #a371f7; }
    .ws-compose { display: flex; gap: 8px; margin: 14px 0 8px; }
    .ws-event-input {
      flex: none; width: 260px; padding: 8px 12px; border-radius: 8px;
      border: 1px solid var(--border); background: var(--bg-2); color: var(--fg);
      font-family: var(--mono); font-size: 13px; outline: none;
    }
    .ws-event-input:focus { border-color: var(--accent); }
    .ws-doc { margin-top: 6px; }
    .ws-log-row { padding: 8px 12px; border-bottom: 1px solid var(--border); }
    .ws-dir { font-size: 11px; margin-right: 8px; }
    .ws-dir-in { color: #3fb950; }
    .ws-dir-out { color: var(--accent); }
    .ws-dir-sys { color: var(--fg-3); }
    .ws-log-name { font-family: var(--mono); font-size: 12.5px; font-weight: 700; }
    .ws-log-time { float: right; font-size: 11px; }
    .ws-log-data { margin: 6px 0 0; font-size: 12px; }

    /* ---- Environments ---- */
    .env-select {
      padding: 7px 10px; border-radius: 8px; border: 1px solid var(--border);
      background: var(--bg-2); color: var(--fg-2); font-size: 12.5px; font-family: var(--font);
      outline: none; cursor: pointer; max-width: 170px;
    }
    .env-select:focus { border-color: var(--accent); }
    .env-pop { width: 360px; }
    .env-pop textarea {
      padding: 7px 10px; border-radius: 8px; border: 1px solid var(--border);
      background: var(--bg-2); color: var(--fg); font-family: var(--mono); font-size: 12.5px;
      outline: none; resize: vertical;
    }
    .env-pop textarea:focus { border-color: var(--accent); }
    .env-list { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; max-height: 130px; overflow-y: auto; }
    .env-item {
      text-align: left; padding: 6px 10px; border-radius: 7px; border: 1px solid var(--border);
      background: var(--bg-2); color: var(--fg); font-family: var(--mono); font-size: 12px; cursor: pointer;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .env-item:hover, .env-item.active { border-color: var(--accent); }
    .env-empty { font-size: 12px; margin-bottom: 8px; }
    .env-actions { display: flex; gap: 8px; margin-bottom: 8px; }
    .env-delete { color: #f85149; }
    .btn-share { flex: none; padding: 9px 12px; font-size: 14px; }

    /* ---- Layout ---- */
    .layout { display: flex; height: calc(100vh - 52px); }
    .workspace { flex: 1; display: flex; flex-direction: column; overflow-y: auto; padding: 14px 22px 40px; }

    /* ---- Sidebar: Overview link + Collections | History ---- */
    .sidebar {
      width: 300px; flex: none; display: flex; flex-direction: column;
      border-right: 1px solid var(--border); background: var(--bg-2);
    }
    .overview-link {
      display: flex; align-items: center; gap: 8px; margin: 10px 8px 0;
      padding: 8px 10px; border: none; border-radius: 8px; background: none;
      color: var(--fg-2); font-family: var(--font); font-size: 13px; font-weight: 700;
      cursor: pointer; text-align: left;
    }
    .overview-link:hover { background: var(--bg-3); color: var(--fg); }
    .overview-link.active { background: var(--bg-3); color: var(--fg); box-shadow: inset 2px 0 0 var(--accent); }
    .ov-icon { font-size: 14px; }
    .side-tabs { display: flex; gap: 2px; padding: 8px 8px 0; border-bottom: 1px solid var(--border); }
    .side-tab {
      flex: 1; padding: 8px 6px; border: none; background: none; cursor: pointer;
      color: var(--fg-2); font-family: var(--font); font-size: 12.5px; font-weight: 700;
      border-bottom: 2px solid transparent; margin-bottom: -1px;
    }
    .side-tab:hover { color: var(--fg); }
    .side-tab.active { color: var(--fg); border-bottom-color: var(--accent); }
    .side-panel { flex: 1; overflow-y: auto; padding: 10px 8px; }
    .group { margin-bottom: 2px; }
    .group-head {
      display: flex; align-items: center; gap: 8px; width: 100%;
      padding: 8px 10px; border: none; border-radius: 8px; background: none;
      color: var(--fg); font-family: var(--font); font-size: 13px; font-weight: 700;
      cursor: pointer; text-align: left;
    }
    .group-head:hover { background: var(--bg-3); }
    .chev { color: var(--fg-3); font-size: 11px; transition: transform 0.15s; }
    .group.open .chev { transform: rotate(90deg); }
    .group-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .group-count {
      font-size: 11px; font-weight: 600; color: var(--fg-3);
      background: var(--bg-3); padding: 1px 8px; border-radius: 20px;
    }
    .group-items { display: none; padding-left: 10px; }
    .group.open .group-items { display: block; }
    .nav-item {
      display: flex; align-items: center; gap: 8px; width: 100%;
      padding: 6px 8px; border: none; border-radius: 7px; background: none;
      color: var(--fg-2); font-family: var(--font); cursor: pointer; text-align: left;
    }
    .nav-item:hover { background: var(--bg-3); color: var(--fg); }
    .nav-item.active { background: var(--bg-3); color: var(--fg); box-shadow: inset 2px 0 0 var(--accent); }
    .nav-text { min-width: 0; display: flex; flex-direction: column; }
    .nav-name { font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .nav-path { font-family: var(--mono); font-size: 10.5px; color: var(--fg-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .hist-status { font-weight: 700; }
    .hist-ok { color: #3fb950; }
    .hist-err { color: #f85149; }
    .hist-other { color: #d29922; }
    .history-clear { margin: 0 0 8px; width: 100%; }

    /* ---- Method badges ---- */
    .method {
      flex: none; width: 62px; text-align: center; padding: 5px 0;
      border-radius: 6px; font-size: 11px; font-weight: 800; letter-spacing: 0.4px;
      font-family: var(--mono); color: #fff;
    }
    .method-sm { width: 38px; padding: 2px 0; font-size: 9.5px; background: none !important; }
    .method-get { background: #2f81f7; } .method-sm.method-get { color: #2f81f7; }
    .method-post { background: #3fb950; } .method-sm.method-post { color: #3fb950; }
    .method-put { background: #d29922; } .method-sm.method-put { color: #d29922; }
    .method-patch { background: #a371f7; } .method-sm.method-patch { color: #a371f7; }
    .method-delete { background: #f85149; } .method-sm.method-delete { color: #f85149; }
    .method-options, .method-head { background: #768390; }
    .method-sm.method-options, .method-sm.method-head { color: #768390; }

    /* ---- Overview page ---- */
    .welcome { flex: 1; display: flex; align-items: center; justify-content: center; }
    .welcome-inner { max-width: 640px; text-align: center; padding: 20px; }
    .ov-badge {
      display: inline-block; padding: 4px 14px; border-radius: 20px;
      background: var(--bg-3); color: var(--fg-2); font-size: 12px; font-weight: 600;
      margin-bottom: 14px; letter-spacing: 0.3px;
    }
    .welcome-inner h1 { font-size: 28px; margin: 0 0 10px; }
    .ov-cards {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;
      margin: 26px 0 14px;
    }
    .ov-card {
      border: 1px solid var(--border); border-radius: 14px; padding: 18px 10px 14px;
      background: var(--bg-2); display: flex; flex-direction: column; gap: 2px;
      transition: transform 0.12s, border-color 0.12s;
    }
    .ov-card:hover { transform: translateY(-2px); border-color: var(--accent); }
    .ov-card b { font-size: 26px; color: var(--accent); font-family: var(--mono); }
    .ov-card span { font-size: 11.5px; color: var(--fg-3); text-transform: uppercase; letter-spacing: 0.8px; font-weight: 700; }
    .ov-card-wide { grid-column: 1 / -1; }
    .ov-base { font-size: 15px !important; overflow-wrap: anywhere; }
    .ov-methods { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; margin: 4px 0 8px; }
    .ov-method { display: flex; align-items: center; gap: 2px; font-size: 12.5px; color: var(--fg-2); font-family: var(--mono); }
    .ov-hint { margin-top: 18px; font-size: 13px; }
    .ov-schemas { text-align: left; margin-top: 26px; }
    .ov-schemas-title { display: flex; align-items: center; gap: 8px; }
    .schema-item { margin-bottom: 4px; }
    .schema-head {
      display: flex; align-items: center; gap: 8px; width: 100%;
      padding: 8px 12px; border: 1px solid var(--border); border-radius: 9px;
      background: var(--bg-2); color: var(--fg); font-family: var(--mono); font-size: 12.5px;
      font-weight: 600; cursor: pointer; text-align: left;
    }
    .schema-head:hover { border-color: var(--accent); }
    .schema-head.open .chev { transform: rotate(90deg); }
    .schema-body { padding: 6px 0 8px; }

    /* ---- Breadcrumb ---- */
    .crumbs { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; font-size: 12.5px; }
    .crumb-link {
      border: none; background: none; padding: 0; cursor: pointer;
      color: var(--fg-3); font-family: var(--font); font-size: 12.5px;
    }
    .crumb-link:hover { color: var(--accent); }
    .crumb-sep { color: var(--fg-3); }
    .crumb { color: var(--fg-2); }
    b.crumb { color: var(--fg); }

    /* ---- Request bar (Postman-style URL bar) ---- */
    .req-bar {
      display: flex; align-items: stretch; gap: 0; margin-bottom: 6px;
      border: 1px solid var(--border); border-radius: 10px; overflow: hidden;
      background: var(--bg-2); box-shadow: 0 1px 3px var(--shadow);
    }
    .req-bar .method { border-radius: 0; width: 84px; display: flex; align-items: center; justify-content: center; font-size: 12px; }
    .url-input {
      flex: 1; border: none; outline: none; padding: 12px 14px;
      background: transparent; color: var(--fg); font-family: var(--mono); font-size: 13.5px;
    }
    .btn-send {
      border: none; padding: 0 28px; background: var(--accent); color: #fff;
      font-weight: 800; font-size: 13.5px; letter-spacing: 0.3px; cursor: pointer;
      font-family: var(--font);
    }
    .btn-send:hover { filter: brightness(1.12); }
    .req-summary { display: flex; align-items: center; gap: 8px; margin: 2px 2px 12px; font-size: 12.5px; }
    .req-hint { margin-left: auto; font-size: 11px; }

    /* ---- Tabs ---- */
    .tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--border); margin-bottom: 12px; }
    .tab {
      padding: 8px 14px; border: none; background: none; cursor: pointer;
      color: var(--fg-2); font-family: var(--font); font-size: 13px; font-weight: 600;
      border-bottom: 2px solid transparent; margin-bottom: -1px;
      display: flex; align-items: center; gap: 5px;
    }
    .tab:hover { color: var(--fg); }
    .tab.active { color: var(--fg); border-bottom-color: var(--accent); }
    .tab-count {
      font-size: 10px; background: var(--bg-3); color: var(--fg-2);
      padding: 0 6px; border-radius: 10px;
    }
    .dot { width: 7px; height: 7px; border-radius: 50%; background: #3fb950; display: inline-block; }
    .panel { min-height: 120px; }
    .panel-empty { color: var(--fg-3); padding: 24px 4px; font-size: 13px; }
    .hidden-note { font-size: 11.5px; margin-bottom: 6px; }

    /* ---- Key/value tables (params & headers) ---- */
    .kv-table { border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
    .kv-row {
      display: grid; grid-template-columns: 36px 200px 1fr 1fr; align-items: center;
      border-bottom: 1px solid var(--border);
    }
    .kv-resp .kv-row { grid-template-columns: 240px 1fr; }
    .kv-row:last-child { border-bottom: none; }
    .kv-header-row { background: var(--bg-2); }
    .kv-ghost .kv-input { color: var(--fg-3); }
    .kv-auto { background: var(--bg-2); opacity: 0.85; }
    .kv-check-cell { display: flex; align-items: center; justify-content: center; padding: 8px 0; }
    .kv-check { accent-color: var(--accent); cursor: pointer; }
    .kv-head {
      padding: 8px 12px; font-size: 11px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.5px; color: var(--fg-3);
    }
    .kv-key { padding: 9px 12px; font-family: var(--mono); font-size: 12.5px; font-weight: 600; }
    .kv-fixed { padding: 9px 12px; font-family: var(--mono); font-size: 12.5px; color: var(--fg-2); overflow-wrap: anywhere; }
    .kv-input {
      width: 100%; border: none; outline: none; padding: 9px 12px;
      background: transparent; color: var(--fg); font-family: var(--mono); font-size: 12.5px;
      border-left: 1px solid var(--border);
    }
    .kv-input:focus { background: var(--bg-2); }
    .kv-desc { padding: 9px 12px; font-size: 12px; color: var(--fg-3); border-left: 1px solid var(--border); }
    .btn-add {
      margin-top: 8px; padding: 6px 12px; border: 1px dashed var(--border); border-radius: 8px;
      background: none; color: var(--fg-2); font-size: 12.5px; cursor: pointer;
      font-family: var(--font);
    }
    .btn-add:hover { color: var(--accent); border-color: var(--accent); }
    .req { color: #f85149; font-style: normal; margin-left: 2px; }

    /* ---- Auth panel ---- */
    .auth-grid { display: grid; grid-template-columns: repeat(3, minmax(160px, 280px)); gap: 12px; }
    .auth-summary { margin-top: 12px; font-size: 12.5px; color: var(--fg-2); }

    /* ---- Body editor ---- */
    .body-bar { margin-bottom: 8px; display: flex; align-items: center; gap: 14px; }
    .body-bar .btn-add { margin-top: 0; margin-left: auto; }
    .body-mode { display: flex; align-items: center; gap: 5px; font-size: 12.5px; color: var(--fg-2); cursor: pointer; }
    .body-mode input { accent-color: var(--accent); cursor: pointer; }
    .body-editor {
      width: 100%; padding: 12px 14px; border-radius: 10px;
      border: 1px solid var(--border); background: var(--bg-2); color: var(--fg);
      font-family: var(--mono); font-size: 12.5px; line-height: 1.6; outline: none; resize: vertical;
    }
    .body-editor:focus { border-color: var(--accent); }

    /* ---- Code snippets tab ---- */
    .code-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .code-bar .btn-add { margin-top: 0; }
    .code-bar select {
      padding: 7px 10px; border-radius: 8px; border: 1px solid var(--border);
      background: var(--bg-2); color: var(--fg); font-family: var(--font); font-size: 12.5px; outline: none;
    }
    .code-bar select:focus { border-color: var(--accent); }

    /* ---- Docs panel ---- */
    .schema { border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; background: var(--bg-2); }
    .prop { display: flex; flex-wrap: wrap; gap: 10px; padding: 3px 0 3px calc(var(--indent, 0) * 18px); font-size: 12.5px; align-items: baseline; }
    .prop-name { font-family: var(--mono); font-weight: 600; }
    .prop-type { color: var(--accent); font-family: var(--mono); font-size: 11.5px; }
    .prop-constraints { color: var(--fg-3); font-size: 11.5px; }
    .prop-desc { color: var(--fg-2); font-size: 12px; flex-basis: 100%; padding-left: 12px; }
    .response-doc { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 6px; }
    .response-doc .code { flex-basis: 100%; }

    /* ---- Shared chips / status / code ---- */
    .chip {
      display: inline-block; padding: 2px 8px; border-radius: 20px;
      font-size: 10.5px; font-weight: 600; background: var(--bg-3); color: var(--fg-2);
    }
    .chip-path { color: var(--accent); }
    .chip-deprecated { background: #f8514922; color: #f85149; text-decoration: line-through; }
    .chip-auth { background: #d2992222; color: #d29922; }
    .path-param { color: var(--accent); }
    .status {
      font-family: var(--mono); font-weight: 700; font-size: 12px;
      padding: 2px 9px; border-radius: 6px;
    }
    .status-ok { background: #3fb95022; color: #3fb950; }
    .status-err { background: #f8514922; color: #f85149; }
    .status-other { background: var(--bg-3); color: var(--fg-2); }
    .code {
      background: var(--bg-2); border: 1px solid var(--border); border-radius: 10px;
      padding: 12px 14px; font-size: 12.5px; overflow-x: auto; margin: 8px 0;
      max-height: 340px; overflow-y: auto; white-space: pre-wrap; overflow-wrap: anywhere;
    }

    /* ---- Response panel ---- */
    .resp { margin-top: 20px; border-top: 1px solid var(--border); padding-top: 12px; }
    .resp-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .resp-tabs { display: flex; align-items: center; gap: 6px; }
    .resp-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: var(--fg-3); margin-right: 8px; }
    .rtab {
      padding: 4px 10px; border: none; border-radius: 7px; background: none; cursor: pointer;
      color: var(--fg-2); font-family: var(--font); font-size: 12px; font-weight: 600;
    }
    .rtab:hover { color: var(--fg); }
    .rtab.active { background: var(--bg-3); color: var(--fg); }
    .btn-copy-resp { margin-top: 0; margin-left: 6px; padding: 3px 10px; font-size: 11.5px; }
    .resp-meta { display: flex; align-items: center; gap: 12px; }
    .meta-item { font-family: var(--mono); font-size: 12px; color: var(--fg-2); }
    .resp-empty { color: var(--fg-3); padding: 22px 4px; font-size: 13px; }
    .resp-code { max-height: 420px; }

    @media (max-width: 900px) {
      .sidebar { width: 220px; }
      .kv-row { grid-template-columns: 30px 130px 1fr; }
      .kv-desc { display: none; }
      .search { width: 120px; }
      .ov-cards { grid-template-columns: 1fr 1fr; }
      .auth-grid { grid-template-columns: 1fr; }
    }
  `;
}
