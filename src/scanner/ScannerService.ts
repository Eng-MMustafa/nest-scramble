/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import * as ts from 'typescript';
import * as path from 'path';
import { TsProject } from '../analysis/TsProject';
import {
  getDecoratorArguments,
  getDecoratorName,
  getDecorators,
  getJsDocInfo,
  numericLiteralValue,
} from '../analysis/AstHelpers';
import { AnalyzedType, DtoAnalyzer } from '../utils/DtoAnalyzer';
import { extractFileFields, fallbackFileField, FileFieldInfo } from '../utils/FileUploadExtractor';
import { extractThrownErrors, ThrownErrorInfo } from '../utils/ThrownErrorExtractor';
import { ScrambleLogger } from '../utils/ScrambleLogger';

/**
 * Resolves a user-supplied source path.
 *
 * An absolute path used to be concatenated onto `process.cwd()`, producing a
 * nonsensical hybrid that silently matched no files. That made it impossible to
 * scan a directory outside the current project, which the `diff` command needs
 * in order to compare two checkouts.
 */
export function resolveSourcePath(sourcePath: string, cwd: string = process.cwd()): string {
  return path.isAbsolute(sourcePath) ? sourcePath : path.join(cwd, sourcePath);
}

export interface ControllerInfo {
  name: string;
  path: string;
  methods: MethodInfo[];
  hasGuards?: boolean;
  version?: string | string[];
  guardTypes?: string[];
  isPublic?: boolean;
}

export interface MethodInfo {
  name: string;
  httpMethod: string;
  route: string;
  parameters: ParameterInfo[];
  returnType: AnalyzedType;
  hasGuards?: boolean;
  version?: string | string[];
  guardTypes?: string[];
  isPublic?: boolean;
  /** Explicit status code from `@HttpCode(...)`, otherwise inferred. */
  httpCode?: number;
  /** First line of the method JSDoc, used as the operation summary. */
  summary?: string;
  /** Remaining JSDoc body, used as the operation description. */
  description?: string;
  deprecated?: boolean;
  /**
   * `multipart/form-data` file fields declared by the method's interceptors.
   * Empty for every route that does not accept an upload.
   */
  fileFields?: FileFieldInfo[];
  /**
   * Error responses recovered from `throw new <HttpException>(...)` statements
   * written directly in the method body.
   */
  errorResponses?: ThrownErrorInfo[];
}

/**
 * Every routing decorator NestJS ships. `@All` has no direct OpenAPI equivalent
 * and is expanded by the transformer.
 */
export const HTTP_METHOD_DECORATORS = [
  'Get',
  'Post',
  'Put',
  'Delete',
  'Patch',
  'Options',
  'Head',
  'All',
] as const;

/**
 * Subset of `HttpStatus` needed to resolve `@HttpCode(HttpStatus.X)`.
 * The enum cannot be evaluated statically, so the common members are mapped.
 */
const HTTP_STATUS_NAMES: Record<string, number> = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NON_AUTHORITATIVE_INFORMATION: 203,
  NO_CONTENT: 204,
  RESET_CONTENT: 205,
  PARTIAL_CONTENT: 206,
  MOVED_PERMANENTLY: 301,
  FOUND: 302,
  SEE_OTHER: 303,
  NOT_MODIFIED: 304,
  TEMPORARY_REDIRECT: 307,
  PERMANENT_REDIRECT: 308,
};

export interface ParameterInfo {
  name: string;
  type: AnalyzedType;
  decorator?: string;
  parameterLocation?: 'path' | 'query' | 'header' | 'body' | 'file';
}

export class ScannerService {
  private project: TsProject | null = null;
  private dtoAnalyzer: DtoAnalyzer | null = null;

  /**
   * Scans the source directory for controllers and their methods
   * @param sourcePath Path to the source directory (e.g., 'src')
   * @returns Array of ControllerInfo
   */
  scanControllers(sourcePath: string): ControllerInfo[] {
    const hostProjectRoot = process.cwd();
    const fullSourcePath = resolveSourcePath(sourcePath, hostProjectRoot);
    const tsconfigPath = path.join(hostProjectRoot, 'tsconfig.json');

    ScrambleLogger.debug(`Scanning directory: ${fullSourcePath}`);
    ScrambleLogger.debug(`Using tsconfig: ${tsconfigPath}`);

    try {
      const fs = require('fs');
      if (!fs.existsSync(tsconfigPath)) {
        ScrambleLogger.warn(`tsconfig.json not found at ${tsconfigPath}; continuing without it`);
        this.project = new TsProject();
      } else {
        this.project = new TsProject(tsconfigPath);
      }
    } catch (error) {
      ScrambleLogger.warn(`Error initializing project scanner: ${error}`);
      this.project = new TsProject();
    }

    try {
      ScrambleLogger.debug(`Adding source files under: ${fullSourcePath}`);
      this.project.addSourceFilesInDirectory(fullSourcePath);
    } catch (error) {
      ScrambleLogger.error(`Error adding source files: ${error}`);
      return [];
    }

    const sourceFiles = this.project.getSourceFiles();
    ScrambleLogger.debug(`Loaded ${sourceFiles.length} TypeScript file(s)`);

    this.dtoAnalyzer = new DtoAnalyzer(this.project.getChecker());

    const controllers: ControllerInfo[] = [];

    const controllerClasses = sourceFiles
      .flatMap(file => file.statements.filter(ts.isClassDeclaration))
      .filter(cls => this.hasControllerDecorator(cls));

    if (controllerClasses.length === 0) {
      ScrambleLogger.debug(`No controllers found in ${fullSourcePath}`);
    } else {
      ScrambleLogger.debug(`Found ${controllerClasses.length} controller(s)`);
    }

    for (const controllerClass of controllerClasses) {
      const controllerInfo = this.extractControllerInfo(controllerClass);
      if (controllerInfo) {
        controllers.push(controllerInfo);
        ScrambleLogger.debug(`  - ${controllerInfo.name} (${controllerInfo.methods.length} endpoint(s))`);
      }
    }

    return controllers;
  }

  /**
   * Provides the checker-backed analyzer, so `extractControllerInfo` can be
   * driven by `IncrementalScannerService` with its own project.
   */
  useChecker(checker: ts.TypeChecker): void {
    this.dtoAnalyzer = new DtoAnalyzer(checker);
  }

  /** True when the class carries a `@Controller()` decorator. */
  hasControllerDecorator(cls: ts.ClassDeclaration): boolean {
    return getDecorators(cls).some(
      decorator => getDecoratorName(decorator) === 'Controller',
    );
  }

  /**
   * Extracts controller metadata from a class declaration.
   *
   * Public so that `IncrementalScannerService` can delegate to it. That service
   * used to carry its own copy of the extraction logic, which drifted: enabling
   * `useIncrementalScanning` silently produced documentation missing `@HttpCode`,
   * JSDoc summaries, and the `@All`/`@Options`/`@Head` verbs.
   */
  extractControllerInfo(cls: ts.ClassDeclaration): ControllerInfo | null {
    const controllerDecorator = getDecorators(cls).find(
      decorator => getDecoratorName(decorator) === 'Controller',
    );

    if (!controllerDecorator) return null;

    const controllerPath = this.extractControllerPath(controllerDecorator) ?? '';
    const version = this.extractVersionDecorator(cls);
    const guardTypes = this.extractGuardTypes(cls);
    const hasGuards = guardTypes.length > 0;
    const isPublic = this.isPublicDecorator(cls);

    const methods: MethodInfo[] = [];

    for (const member of cls.members) {
      if (!ts.isMethodDeclaration(member)) continue;
      const methodInfo = this.extractMethodInfo(member);
      if (methodInfo) {
        methods.push(methodInfo);
      }
    }

    return {
      name: cls.name?.text || 'UnknownController',
      path: controllerPath,
      methods,
      hasGuards,
      version,
      guardTypes,
      isPublic,
    };
  }

  private extractDecoratorArgument(decorator: ts.Decorator): string | undefined {
    const args = getDecoratorArguments(decorator);
    if (args.length === 0) return '';
    const firstArg = args[0];
    if (ts.isStringLiteral(firstArg)) {
      return firstArg.text;
    }
    if (ts.isArrayLiteralExpression(firstArg)) {
      // `@Get(['a', 'b'])` registers several routes; the first is representative.
      const first = firstArg.elements[0];
      if (first && ts.isStringLiteral(first)) {
        return first.text;
      }
    }
    return undefined;
  }

  /**
   * Reads the controller path from all the forms NestJS accepts:
   * `@Controller('users')`, `@Controller(['users', 'people'])`,
   * `@Controller({ path: 'users', version: '1' })` and bare `@Controller()`.
   *
   * Only the string form was previously handled, so object-form controllers
   * silently lost their base path.
   */
  private extractControllerPath(decorator: ts.Decorator): string | undefined {
    const args = getDecoratorArguments(decorator);
    if (args.length === 0) return '';

    const firstArg = args[0];

    if (ts.isObjectLiteralExpression(firstArg)) {
      for (const prop of firstArg.properties) {
        if (!ts.isPropertyAssignment(prop) || prop.name.getText() !== 'path') continue;

        const initializer = prop.initializer;
        if (ts.isStringLiteral(initializer)) {
          return initializer.text;
        }
        if (ts.isArrayLiteralExpression(initializer)) {
          const first = initializer.elements[0];
          if (first && ts.isStringLiteral(first)) {
            return first.text;
          }
        }
      }
      // An object without a `path` means the controller is mounted at the root.
      return '';
    }

    return this.extractDecoratorArgument(decorator);
  }

  /** Reads the numeric argument of `@HttpCode(...)`. */
  private extractHttpCode(method: ts.MethodDeclaration): number | undefined {
    const decorator = getDecorators(method).find(
      d => getDecoratorName(d) === 'HttpCode',
    );
    if (!decorator) return undefined;

    const args = getDecoratorArguments(decorator);
    const first = args[0];

    if (first) {
      const value = numericLiteralValue(first);
      if (value !== undefined) return value;
    }

    // Supports `@HttpCode(HttpStatus.NO_CONTENT)`.
    if (first && ts.isPropertyAccessExpression(first)) {
      const statusName = first.name.text;
      const known = HTTP_STATUS_NAMES[statusName];
      if (known !== undefined) return known;
    }

    return undefined;
  }

  /**
   * Splits the method JSDoc into a one-line summary and the remaining body,
   * which is far more useful in the docs UI than the raw method name.
   */
  private extractJsDoc(method: ts.MethodDeclaration): { summary?: string; description?: string; deprecated?: boolean } {
    const { description: text, deprecated } = getJsDocInfo(method);
    if (!text) return { deprecated };

    const [firstLine, ...rest] = text.split('\n');
    const body = rest.join('\n').trim();

    return {
      summary: firstLine.trim() || undefined,
      description: body || undefined,
      deprecated,
    };
  }

  private extractVersionDecorator(node: ts.ClassDeclaration | ts.MethodDeclaration): string | string[] | undefined {
    const versionDecorator = getDecorators(node).find(
      decorator => getDecoratorName(decorator) === 'Version',
    );

    if (!versionDecorator) return undefined;

    const args = getDecoratorArguments(versionDecorator);
    if (args.length === 0) return undefined;

    const firstArg = args[0];

    if (ts.isStringLiteral(firstArg)) {
      return firstArg.text;
    }

    if (ts.isArrayLiteralExpression(firstArg)) {
      const versions: string[] = [];
      for (const element of firstArg.elements) {
        if (ts.isStringLiteral(element)) {
          versions.push(element.text);
        }
      }
      return versions.length > 0 ? versions : undefined;
    }

    return undefined;
  }

  private extractGuardTypes(node: ts.ClassDeclaration | ts.MethodDeclaration): string[] {
    const guardTypes: string[] = [];

    const useGuardsDecorators = getDecorators(node).filter(
      decorator => getDecoratorName(decorator) === 'UseGuards',
    );

    for (const decorator of useGuardsDecorators) {
      for (const arg of getDecoratorArguments(decorator)) {
        if (ts.isIdentifier(arg)) {
          guardTypes.push(arg.text);
        }
        else if (ts.isCallExpression(arg)) {
          const expr = arg.expression;
          if (ts.isIdentifier(expr) && expr.text === 'AuthGuard') {
            const guardArgs = arg.arguments;
            if (guardArgs.length > 0 && ts.isStringLiteral(guardArgs[0])) {
              const strategy = guardArgs[0].text;
              guardTypes.push(`AuthGuard(${strategy})`);
            } else {
              guardTypes.push('AuthGuard');
            }
          }
        }
      }
    }

    return guardTypes;
  }

  private isPublicDecorator(node: ts.ClassDeclaration | ts.MethodDeclaration): boolean {
    return getDecorators(node).some(decorator => {
      const name = getDecoratorName(decorator);

      if (name === 'Public') {
        return true;
      }

      if (name === 'SetMetadata') {
        const args = getDecoratorArguments(decorator);
        if (args.length >= 2) {
          const firstArg = args[0];
          const secondArg = args[1];
          if (ts.isStringLiteral(firstArg) && firstArg.text === 'isPublic') {
            if (secondArg.getText() === 'true') {
              return true;
            }
          }
        }
      }

      return false;
    });
  }

  private extractMethodInfo(method: ts.MethodDeclaration): MethodInfo | null {
    const analyzer = this.dtoAnalyzer;
    if (!analyzer) {
      ScrambleLogger.error('Scanner used before a project was initialized');
      return null;
    }

    const httpDecorator = getDecorators(method).find(decorator => {
      const decoratorName = getDecoratorName(decorator);
      return (
        decoratorName !== undefined &&
        (HTTP_METHOD_DECORATORS as readonly string[]).includes(decoratorName)
      );
    });

    if (!httpDecorator) return null;

    const httpMethod = getDecoratorName(httpDecorator)!.toUpperCase();
    const route = this.extractDecoratorArgument(httpDecorator) || '';

    const version = this.extractVersionDecorator(method);
    const guardTypes = this.extractGuardTypes(method);
    const hasGuards = guardTypes.length > 0;
    const isPublic = this.isPublicDecorator(method);

    const parameters: ParameterInfo[] = method.parameters.map(param => {
      const decoratorText = getDecorators(param).map(d => d.getText()).join(' ');
      let parameterLocation: 'path' | 'query' | 'header' | 'body' | 'file' | undefined;

      // Checked before `@Body`, because an upload route commonly declares both
      // and the file parameter must not be mistaken for the JSON body.
      if (decoratorText.includes('@UploadedFile')) {
        parameterLocation = 'file';
      } else if (decoratorText.includes('@Body')) {
        parameterLocation = 'body';
      } else if (decoratorText.includes('@Param')) {
        parameterLocation = 'path';
      } else if (decoratorText.includes('@Query')) {
        parameterLocation = 'query';
      } else if (decoratorText.includes('@Headers')) {
        parameterLocation = 'header';
      }

      return {
        name: param.name.getText(),
        type: analyzer.analyzeType(analyzer.typeOf(param)),
        decorator: decoratorText,
        parameterLocation,
      };
    });

    const returnType = analyzer.analyzeType(analyzer.returnTypeOf(method));
    const httpCode = this.extractHttpCode(method);
    const { summary, description, deprecated } = this.extractJsDoc(method);

    // The field name lives in the interceptor, not in `@UploadedFile()`.
    let fileFields = extractFileFields(method);

    if (fileFields.length === 0) {
      // A custom or unrecognised interceptor still leaves an upload parameter
      // behind. Documenting a generic field beats documenting no body at all.
      const uploadParam = parameters.find(p => p.parameterLocation === 'file');
      if (uploadParam) {
        fileFields = [fallbackFileField(uploadParam.decorator?.includes('@UploadedFiles') ?? false)];
      }
    }

    const errorResponses = extractThrownErrors(method);

    return {
      name: method.name.getText(),
      httpMethod,
      route,
      parameters,
      returnType,
      hasGuards,
      version,
      guardTypes,
      isPublic,
      httpCode,
      summary,
      description,
      deprecated,
      fileFields: fileFields.length > 0 ? fileFields : undefined,
      errorResponses: errorResponses.length > 0 ? errorResponses : undefined,
    };
  }
}