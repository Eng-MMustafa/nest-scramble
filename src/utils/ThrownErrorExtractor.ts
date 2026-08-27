/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import * as ts from 'typescript';
import { numericLiteralValue, stringLiteralValue } from '../analysis/AstHelpers';

/**
 * An error response recovered from a `throw` statement in a controller method.
 *
 * The generated spec used to document only the success path; a method that
 * plainly says `throw new NotFoundException()` still produced a document with
 * no 404. Consumers reading the docs — and the typed client generated from
 * them — had no idea which errors to handle.
 */
export interface ThrownErrorInfo {
  status: number;
  description: string;
}

/**
 * Every built-in `HttpException` subclass NestJS ships, mapped to its status.
 */
const EXCEPTION_STATUS: Record<string, number> = {
  BadRequestException: 400,
  UnauthorizedException: 401,
  PaymentRequiredException: 402,
  ForbiddenException: 403,
  NotFoundException: 404,
  MethodNotAllowedException: 405,
  NotAcceptableException: 406,
  RequestTimeoutException: 408,
  ConflictException: 409,
  GoneException: 410,
  PreconditionFailedException: 412,
  PayloadTooLargeException: 413,
  UnsupportedMediaTypeException: 415,
  ImATeapotException: 418,
  MisdirectedException: 421,
  UnprocessableEntityException: 422,
  InternalServerErrorException: 500,
  NotImplementedException: 501,
  BadGatewayException: 502,
  ServiceUnavailableException: 503,
  GatewayTimeoutException: 504,
  HttpVersionNotSupportedException: 505,
};

/** Default reason phrases, used when the throw carries no literal message. */
const DEFAULT_DESCRIPTIONS: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  402: 'Payment Required',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  406: 'Not Acceptable',
  408: 'Request Timeout',
  409: 'Conflict',
  410: 'Gone',
  412: 'Precondition Failed',
  413: 'Payload Too Large',
  415: 'Unsupported Media Type',
  418: "I'm a teapot",
  421: 'Misdirected',
  422: 'Unprocessable Entity',
  500: 'Internal Server Error',
  501: 'Not Implemented',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
  505: 'HTTP Version Not Supported',
};

/**
 * `HttpStatus` error members, for `new HttpException(msg, HttpStatus.CONFLICT)`.
 * The enum cannot be evaluated statically, so the members are mapped.
 */
const HTTP_STATUS_ERROR_NAMES: Record<string, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  PAYMENT_REQUIRED: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  NOT_ACCEPTABLE: 406,
  REQUEST_TIMEOUT: 408,
  CONFLICT: 409,
  GONE: 410,
  PRECONDITION_FAILED: 412,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  I_AM_A_TEAPOT: 418,
  MISDIRECTED: 421,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
  HTTP_VERSION_NOT_SUPPORTED: 505,
};

/** Resolves the status of one `new <Exception>(...)` expression, if known. */
function statusOfNewExpression(expr: ts.NewExpression): number | undefined {
  if (!ts.isIdentifier(expr.expression)) return undefined;
  const className = expr.expression.text;

  const builtin = EXCEPTION_STATUS[className];
  if (builtin !== undefined) return builtin;

  // `new HttpException(message, status)` — literal or `HttpStatus.X`.
  if (className === 'HttpException') {
    const statusArg = expr.arguments?.[1];
    if (!statusArg) return undefined;

    const literal = numericLiteralValue(statusArg);
    if (literal !== undefined) return literal;

    if (ts.isPropertyAccessExpression(statusArg)) {
      return HTTP_STATUS_ERROR_NAMES[statusArg.name.text];
    }
  }

  return undefined;
}

/** The first string-literal argument of the throw, used as the description. */
function messageOfNewExpression(expr: ts.NewExpression): string | undefined {
  const first = expr.arguments?.[0];
  return first ? stringLiteralValue(first) : undefined;
}

/**
 * Extracts every documented error a controller method can throw.
 *
 * Only `throw new <Exception>(...)` statements written directly in the method
 * body (including nested blocks, but not inside closures passed elsewhere) are
 * read — exceptions thrown by called services are invisible to static
 * analysis, and guessing them would put wrong statuses in the spec. Duplicate
 * statuses collapse to one response; the first literal message wins.
 */
export function extractThrownErrors(method: ts.MethodDeclaration): ThrownErrorInfo[] {
  if (!method.body) return [];

  const byStatus = new Map<number, ThrownErrorInfo>();

  const visit = (node: ts.Node): void => {
    if (ts.isThrowStatement(node) && ts.isNewExpression(node.expression)) {
      const status = statusOfNewExpression(node.expression);
      if (status !== undefined && !byStatus.has(status)) {
        byStatus.set(status, {
          status,
          description:
            messageOfNewExpression(node.expression) ??
            DEFAULT_DESCRIPTIONS[status] ??
            `Error ${status}`,
        });
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(method.body);

  return [...byStatus.values()].sort((a, b) => a.status - b.status);
}
