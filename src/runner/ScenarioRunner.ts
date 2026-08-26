/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import { compareWithSchema, matchSpecPath } from '../drift/DriftDetector';

/**
 * Declarative API test scenarios: a chain of requests where each step can
 * capture values from the response (a token, an id) and feed them into the
 * next step via `{{variables}}` — the Postman Collection Runner experience,
 * runnable in CI with zero dependencies.
 */
export interface ScenarioStep {
  name: string;
  request: {
    method: string;
    /** Path relative to `baseUrl`, may contain `{{variables}}`. */
    path: string;
    headers?: Record<string, string>;
    /** JSON body; string values may contain `{{variables}}`. */
    body?: unknown;
  };
  expect?: {
    /** Accepted status code(s). Defaults to any 2xx. */
    status?: number | number[];
    /** Subset match: every listed field must equal the response value. */
    bodyContains?: unknown;
    /** Validate the response against the generated OpenAPI schema. */
    matchesSpec?: boolean;
  };
  /** Variables to capture from the response, as `name -> $.json.path`. */
  capture?: Record<string, string>;
}

export interface Scenario {
  name: string;
  baseUrl?: string;
  /** Initial variables, extended by every `capture`. */
  vars?: Record<string, string>;
  steps: ScenarioStep[];
}

export interface StepResult {
  name: string;
  passed: boolean;
  failures: string[];
  status?: number;
  ms: number;
}

export interface ScenarioResult {
  name: string;
  passed: boolean;
  steps: StepResult[];
}

export interface RunOptions {
  /** Overrides the scenario's own baseUrl. */
  baseUrl?: string;
  /** OpenAPI document used by `matchesSpec` assertions. */
  spec?: any;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: (url: string, init: any) => Promise<{ status: number; text(): Promise<string> }>;
}

/** Replaces `{{name}}` placeholders from the variable map. */
export function fillVars(text: string, vars: Record<string, string>): string {
  return String(text).replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, key) =>
    vars[key] !== undefined ? vars[key] : match,
  );
}

function fillVarsDeep(value: unknown, vars: Record<string, string>): unknown {
  if (typeof value === 'string') return fillVars(value, vars);
  if (Array.isArray(value)) return value.map(item => fillVarsDeep(item, vars));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>)) {
      out[key] = fillVarsDeep((value as Record<string, unknown>)[key], vars);
    }
    return out;
  }
  return value;
}

/**
 * Minimal JSON path: `$.a.b[0].c`. Deliberately tiny — full JSONPath is a
 * dependency and a learning curve; dotted access covers real capture needs.
 */
export function extractPath(payload: unknown, path: string): unknown {
  const trimmed = path.replace(/^\$\.?/, '');
  if (!trimmed) return payload;

  let node: any = payload;
  for (const rawSegment of trimmed.split('.')) {
    if (node === null || node === undefined) return undefined;
    const match = /^([^[\]]*)((?:\[\d+\])*)$/.exec(rawSegment);
    if (!match) return undefined;

    if (match[1]) node = node[match[1]];

    const indexes = match[2].match(/\d+/g) || [];
    for (const index of indexes) {
      if (node === null || node === undefined) return undefined;
      node = node[Number(index)];
    }
  }
  return node;
}

/** Subset equality: every field in `expected` must be present and equal. */
export function containsSubset(actual: unknown, expected: unknown): string[] {
  const failures: string[] = [];
  walk(actual, expected, '');
  return failures;

  function walk(actualNode: unknown, expectedNode: unknown, at: string) {
    if (expectedNode === null || typeof expectedNode !== 'object') {
      if (actualNode !== expectedNode) {
        failures.push(
          `${at || '(root)'}: expected ${JSON.stringify(expectedNode)}, got ${JSON.stringify(actualNode)}`,
        );
      }
      return;
    }

    if (Array.isArray(expectedNode)) {
      if (!Array.isArray(actualNode)) {
        failures.push(`${at || '(root)'}: expected an array`);
        return;
      }
      expectedNode.forEach((item, index) => walk(actualNode[index], item, `${at}[${index}]`));
      return;
    }

    if (actualNode === null || typeof actualNode !== 'object') {
      failures.push(`${at || '(root)'}: expected an object`);
      return;
    }

    for (const key of Object.keys(expectedNode as Record<string, unknown>)) {
      walk(
        (actualNode as Record<string, unknown>)[key],
        (expectedNode as Record<string, unknown>)[key],
        at ? `${at}.${key}` : key,
      );
    }
  }
}

/** Runs one scenario, step by step, stopping variables but not the run on failure. */
export async function runScenario(scenario: Scenario, options: RunOptions = {}): Promise<ScenarioResult> {
  const fetchImpl = options.fetchImpl || (globalThis as any).fetch;
  if (!fetchImpl) {
    throw new Error('No fetch implementation available — Node 18+ is required.');
  }

  const baseUrl = (options.baseUrl || scenario.baseUrl || 'http://localhost:3000').replace(/\/+$/, '');
  const vars: Record<string, string> = { ...(scenario.vars || {}) };
  const steps: StepResult[] = [];

  for (const step of scenario.steps) {
    const failures: string[] = [];
    const started = Date.now();
    let status: number | undefined;

    try {
      const path = fillVars(step.request.path, vars);
      const url = path.startsWith('http') ? path : baseUrl + path;
      const headers: Record<string, string> = {};
      for (const key of Object.keys(step.request.headers || {})) {
        headers[key] = fillVars(step.request.headers![key], vars);
      }

      const init: any = { method: step.request.method.toUpperCase(), headers };
      if (step.request.body !== undefined) {
        headers['Content-Type'] = headers['Content-Type'] || 'application/json';
        init.body = JSON.stringify(fillVarsDeep(step.request.body, vars));
      }

      const response = await fetchImpl(url, init);
      const statusCode = response.status;
      status = statusCode;
      const text = await response.text();
      let body: unknown = undefined;
      try {
        body = text ? JSON.parse(text) : undefined;
      } catch {
        body = text;
      }

      // 1. Status assertion.
      const expected = step.expect?.status;
      if (expected !== undefined) {
        const accepted = Array.isArray(expected) ? expected : [expected];
        if (!accepted.includes(statusCode)) {
          failures.push(`status: expected ${accepted.join(' or ')}, got ${statusCode}`);
        }
      } else if (statusCode < 200 || statusCode >= 300) {
        failures.push(`status: expected 2xx, got ${statusCode}`);
      }

      // 2. Body subset assertion.
      if (step.expect?.bodyContains !== undefined) {
        failures.push(...containsSubset(body, step.expect.bodyContains));
      }

      // 3. Contract assertion against the generated OpenAPI document.
      if (step.expect?.matchesSpec) {
        if (!options.spec) {
          failures.push('matchesSpec: no OpenAPI document was provided to the runner');
        } else {
          const specPath = matchSpecPath(options.spec, path.replace(/^https?:\/\/[^/]+/, '').split('?')[0]);
          const operation = specPath
            ? options.spec.paths[specPath][step.request.method.toLowerCase()]
            : undefined;
          const schema = operation?.responses?.[String(statusCode)]?.content?.['application/json']?.schema;
          if (!schema) {
            failures.push(`matchesSpec: no documented schema for ${step.request.method.toUpperCase()} ${path} → ${statusCode}`);
          } else {
            for (const issue of compareWithSchema(body, schema, options.spec)) {
              failures.push(`matchesSpec: [${issue.kind}] ${issue.location}: ${issue.message}`);
            }
          }
        }
      }

      // 4. Captures feed later steps even when assertions failed — a chain
      //    should report every broken step, not just the first.
      for (const name of Object.keys(step.capture || {})) {
        const value = extractPath(body, step.capture![name]);
        if (value === undefined) {
          failures.push(`capture: ${step.capture![name]} did not match anything`);
        } else {
          vars[name] = typeof value === 'string' ? value : JSON.stringify(value);
        }
      }
    } catch (error) {
      failures.push(`request failed: ${error instanceof Error ? error.message : error}`);
    }

    steps.push({
      name: step.name,
      passed: failures.length === 0,
      failures,
      status,
      ms: Date.now() - started,
    });
  }

  return {
    name: scenario.name,
    passed: steps.every(step => step.passed),
    steps,
  };
}

/** Renders results for terminals. */
export function formatScenarioResult(result: ScenarioResult): string {
  const lines: string[] = [];
  const icon = result.passed ? '✅' : '❌';
  lines.push(`${icon} ${result.name}`);

  for (const step of result.steps) {
    const mark = step.passed ? '✓' : '✖';
    lines.push(`   ${mark} ${step.name} (${step.status ?? '—'}, ${step.ms} ms)`);
    for (const failure of step.failures) {
      lines.push(`       ${failure}`);
    }
  }

  return lines.join('\n');
}
