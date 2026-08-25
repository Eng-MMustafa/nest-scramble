/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import { Node, PropertyDeclaration, SyntaxKind } from 'ts-morph';

/**
 * OpenAPI-shaped constraints recovered from `class-validator` decorators.
 *
 * Almost every real NestJS DTO expresses its contract through these decorators.
 * Reading only the TypeScript type discards that contract entirely, which is why
 * generated specs were low fidelity: no `format`, no bounds, no patterns.
 */
export interface ValidationConstraints {
  format?: string;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  enum?: (string | number)[];
  isInteger?: boolean;
  /** `@IsOptional()` marks the property as not required regardless of `?`. */
  explicitlyOptional?: boolean;
  /** `@IsNotEmpty()` / `@IsDefined()` mark it as required even without `!`. */
  explicitlyRequired?: boolean;
}

/** Decorators that map directly to an OpenAPI `format`. */
const FORMAT_DECORATORS: Record<string, string> = {
  IsEmail: 'email',
  IsUUID: 'uuid',
  IsUrl: 'uri',
  IsURL: 'uri',
  IsDateString: 'date-time',
  IsISO8601: 'date-time',
  IsDate: 'date-time',
  IsIP: 'ipv4',
  IsIPv4: 'ipv4',
  IsIPv6: 'ipv6',
  IsHostname: 'hostname',
  IsJWT: 'jwt',
  IsByteLength: 'byte',
  IsBase64: 'byte',
  IsMongoId: 'objectid',
  IsPhoneNumber: 'phone',
  IsHexColor: 'hex-color',
  IsCreditCard: 'credit-card',
  IsSemVer: 'semver',
};

/** Reads a numeric decorator argument, if it is a literal. */
function numericArg(args: Node[], index: number): number | undefined {
  const arg = args[index];
  if (!arg) return undefined;

  if (Node.isNumericLiteral(arg)) {
    return arg.getLiteralValue();
  }

  // Handles negative literals such as `@Min(-1)`, which parse as a prefix
  // unary expression rather than a numeric literal.
  if (Node.isPrefixUnaryExpression(arg)) {
    const operand = arg.getOperand();
    if (Node.isNumericLiteral(operand)) {
      const value = operand.getLiteralValue();
      return arg.getOperatorToken() === SyntaxKind.MinusToken ? -value : value;
    }
  }

  return undefined;
}

/** Reads the members of an array literal argument, if they are literals. */
function literalArrayArg(args: Node[], index: number): (string | number)[] | undefined {
  const arg = args[index];
  if (!arg || !Node.isArrayLiteralExpression(arg)) return undefined;

  const values: (string | number)[] = [];
  for (const element of arg.getElements()) {
    if (Node.isStringLiteral(element)) {
      values.push(element.getLiteralValue());
    } else if (Node.isNumericLiteral(element)) {
      values.push(element.getLiteralValue());
    } else {
      return undefined;
    }
  }

  return values.length > 0 ? values : undefined;
}

/** Extracts the source text of a regular expression argument. */
function regexArg(args: Node[], index: number): string | undefined {
  const arg = args[index];
  if (!arg) return undefined;

  if (Node.isRegularExpressionLiteral(arg)) {
    // `/^ab+c$/i` -> `^ab+c$`; OpenAPI patterns carry no delimiters or flags.
    const text = arg.getLiteralText();
    const match = /^\/(.*)\/[a-z]*$/s.exec(text);
    return match ? match[1] : undefined;
  }

  if (Node.isStringLiteral(arg)) {
    return arg.getLiteralValue();
  }

  return undefined;
}

/**
 * Extracts OpenAPI constraints from the `class-validator` decorators applied to
 * a DTO property. Unknown decorators are ignored rather than guessed.
 */
export function extractValidationConstraints(
  prop: PropertyDeclaration,
): ValidationConstraints | undefined {
  const constraints: ValidationConstraints = {};
  let found = false;

  for (const decorator of prop.getDecorators()) {
    const name = decorator.getName();
    const args = decorator.getCallExpression()?.getArguments() ?? [];

    const format = FORMAT_DECORATORS[name];
    if (format) {
      constraints.format = format;
      found = true;
      continue;
    }

    switch (name) {
      case 'MinLength': {
        const value = numericArg(args, 0);
        if (value !== undefined) {
          constraints.minLength = value;
          found = true;
        }
        break;
      }
      case 'MaxLength': {
        const value = numericArg(args, 0);
        if (value !== undefined) {
          constraints.maxLength = value;
          found = true;
        }
        break;
      }
      case 'Length': {
        const min = numericArg(args, 0);
        const max = numericArg(args, 1);
        if (min !== undefined) {
          constraints.minLength = min;
          found = true;
        }
        if (max !== undefined) {
          constraints.maxLength = max;
          found = true;
        }
        break;
      }
      case 'Min': {
        const value = numericArg(args, 0);
        if (value !== undefined) {
          constraints.minimum = value;
          found = true;
        }
        break;
      }
      case 'Max': {
        const value = numericArg(args, 0);
        if (value !== undefined) {
          constraints.maximum = value;
          found = true;
        }
        break;
      }
      case 'IsPositive':
        constraints.exclusiveMinimum = 0;
        found = true;
        break;
      case 'IsNegative':
        constraints.exclusiveMaximum = 0;
        found = true;
        break;
      case 'IsInt':
        constraints.isInteger = true;
        found = true;
        break;
      case 'IsDivisibleBy': {
        const value = numericArg(args, 0);
        if (value !== undefined) {
          constraints.multipleOf = value;
          found = true;
        }
        break;
      }
      case 'Matches': {
        const pattern = regexArg(args, 0);
        if (pattern !== undefined) {
          constraints.pattern = pattern;
          found = true;
        }
        break;
      }
      case 'IsIn': {
        const values = literalArrayArg(args, 0);
        if (values) {
          constraints.enum = values;
          found = true;
        }
        break;
      }
      case 'ArrayMinSize': {
        const value = numericArg(args, 0);
        if (value !== undefined) {
          constraints.minItems = value;
          found = true;
        }
        break;
      }
      case 'ArrayMaxSize': {
        const value = numericArg(args, 0);
        if (value !== undefined) {
          constraints.maxItems = value;
          found = true;
        }
        break;
      }
      case 'ArrayUnique':
        constraints.uniqueItems = true;
        found = true;
        break;
      case 'IsNotEmpty':
        // For strings this also implies a non-empty value.
        constraints.explicitlyRequired = true;
        if (constraints.minLength === undefined) {
          constraints.minLength = 1;
        }
        found = true;
        break;
      case 'IsDefined':
        constraints.explicitlyRequired = true;
        found = true;
        break;
      case 'IsOptional':
        constraints.explicitlyOptional = true;
        found = true;
        break;
      default:
        break;
    }
  }

  return found ? constraints : undefined;
}
