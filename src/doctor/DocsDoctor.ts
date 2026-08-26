/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import { ControllerInfo, MethodInfo } from '../scanner/ScannerService';
import { AnalyzedType } from '../utils/DtoAnalyzer';

/**
 * A single documentation-quality finding.
 *
 * The doctor never fails silently: every place where static analysis could not
 * recover the API contract becomes an actionable issue pointing at the exact
 * controller and method, so fixing the source improves the generated spec.
 */
export interface DoctorIssue {
  severity: 'error' | 'warning' | 'hint';
  /** Stable machine-readable identifier, e.g. `missing-return-type`. */
  code: string;
  message: string;
  controller: string;
  method: string;
  route: string;
}

export interface DoctorReport {
  /** 0-100 aggregate documentation health score. */
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  controllerCount: number;
  endpointCount: number;
  issues: DoctorIssue[];
  stats: {
    errors: number;
    warnings: number;
    hints: number;
  };
}

/** Type texts that carry no contract information. */
const OPAQUE_TYPES = new Set(['any', 'unknown', 'object', '{}', 'Object', 'Function']);

function isOpaque(type: AnalyzedType | undefined): boolean {
  if (!type) return true;
  if (type.properties && type.properties.length > 0) return false;
  if (type.enumValues && type.enumValues.length > 0) return false;
  return OPAQUE_TYPES.has(type.type);
}

/** `void`/`undefined` are legitimate for 204-style endpoints. */
function isVoid(type: AnalyzedType | undefined): boolean {
  return !!type && (type.type === 'void' || type.type === 'undefined');
}

function gradeFor(score: number): DoctorReport['grade'] {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

/**
 * Scores one endpoint out of 100.
 *
 * Weights mirror how much each part contributes to a useful generated spec:
 * the response shape matters most, then request typing, then prose.
 */
function scoreEndpoint(method: MethodInfo, issues: DoctorIssue[], controller: ControllerInfo): number {
  let score = 0;
  const where = {
    controller: controller.name,
    method: method.name,
    route: `${method.httpMethod.toUpperCase()} /${[controller.path, method.route].filter(Boolean).join('/')}`.replace(/\/+/g, '/').replace(' /', ' /'),
  };

  // 1. Return type (40 points) — the response schema is the spec's core.
  if (isVoid(method.returnType) || !isOpaque(method.returnType)) {
    score += 40;
  } else {
    issues.push({
      severity: 'error',
      code: 'missing-return-type',
      message: `Return type is '${method.returnType?.type ?? 'unknown'}' — add an explicit return type (e.g. Promise<UserDto>) so the response schema can be generated.`,
      ...where,
    });
  }

  // 2. Typed parameters (25 points).
  const params = method.parameters ?? [];
  const untyped = params.filter(p => p.parameterLocation !== 'file' && isOpaque(p.type));
  if (untyped.length === 0) {
    score += 25;
  } else {
    for (const param of untyped) {
      issues.push({
        severity: 'warning',
        code: 'untyped-parameter',
        message: `Parameter '${param.name}' has type '${param.type?.type ?? 'unknown'}' — declare a DTO class or primitive type.`,
        ...where,
      });
    }
  }

  // 3. Summary / description (20 points) — JSDoc becomes operation summary.
  if (method.summary || method.description) {
    score += 20;
  } else {
    issues.push({
      severity: 'hint',
      code: 'missing-summary',
      message: 'No JSDoc comment — the first line becomes the operation summary in the docs.',
      ...where,
    });
  }

  // 4. Body validation (15 points) — class-validator decorators become schema
  //    constraints (minLength, format, ...), the mock data and the fuzzer input.
  const body = params.find(p => p.parameterLocation === 'body');
  if (!body) {
    score += 15;
  } else if ((body.type.properties ?? []).some(p => p.validation && Object.keys(p.validation).length > 0)) {
    score += 15;
  } else if ((body.type.properties ?? []).length > 0) {
    score += 7;
    issues.push({
      severity: 'hint',
      code: 'unvalidated-body',
      message: `Body DTO '${body.type.type}' has no class-validator decorators — constraints like @MinLength/@IsEmail enrich the schema and the mock data.`,
      ...where,
    });
  } else {
    issues.push({
      severity: 'warning',
      code: 'opaque-body',
      message: `Body parameter '${body.name}' has no recoverable properties — use a DTO class instead of '${body.type.type}'.`,
      ...where,
    });
  }

  return score;
}

/**
 * Analyzes scanned controllers and produces a documentation health report.
 * Pure function over `ControllerInfo[]` so it is trivially testable and can be
 * reused by the module, the CLI and CI pipelines.
 */
export function diagnose(controllers: ControllerInfo[]): DoctorReport {
  const issues: DoctorIssue[] = [];
  let total = 0;
  let endpointCount = 0;

  for (const controller of controllers) {
    for (const method of controller.methods) {
      total += scoreEndpoint(method, issues, controller);
      endpointCount += 1;
    }
  }

  const score = endpointCount === 0 ? 0 : Math.round(total / endpointCount);

  return {
    score,
    grade: gradeFor(score),
    controllerCount: controllers.length,
    endpointCount,
    issues,
    stats: {
      errors: issues.filter(i => i.severity === 'error').length,
      warnings: issues.filter(i => i.severity === 'warning').length,
      hints: issues.filter(i => i.severity === 'hint').length,
    },
  };
}

const SEVERITY_ICONS: Record<DoctorIssue['severity'], string> = {
  error: '✖',
  warning: '⚠',
  hint: '💡',
};

/** Renders the report for terminals. Kept dependency-free (no chalk). */
export function formatDoctorReport(report: DoctorReport): string {
  const lines: string[] = [];
  const bar = '='.repeat(60);

  lines.push(bar);
  lines.push('🩺 Nest-Scramble Doctor — Documentation Health Report');
  lines.push(bar);
  lines.push('');
  lines.push(`   Score: ${report.score}/100  (grade ${report.grade})`);
  lines.push(`   Controllers: ${report.controllerCount}   Endpoints: ${report.endpointCount}`);
  lines.push(`   Issues: ${report.stats.errors} error(s), ${report.stats.warnings} warning(s), ${report.stats.hints} hint(s)`);
  lines.push('');

  if (report.issues.length === 0) {
    lines.push('   ✅ Perfect! Every endpoint is fully documented.');
  } else {
    const byRoute = new Map<string, DoctorIssue[]>();
    for (const issue of report.issues) {
      const key = `${issue.controller} → ${issue.route}`;
      if (!byRoute.has(key)) byRoute.set(key, []);
      byRoute.get(key)!.push(issue);
    }

    for (const [route, routeIssues] of byRoute) {
      lines.push(`   ${route}`);
      for (const issue of routeIssues) {
        lines.push(`     ${SEVERITY_ICONS[issue.severity]} [${issue.code}] ${issue.message}`);
      }
      lines.push('');
    }
  }

  lines.push(bar);
  return lines.join('\n');
}
