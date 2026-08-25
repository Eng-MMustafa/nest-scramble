/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import { ClassDeclaration, Decorator, MethodDeclaration, Node, Project } from 'ts-morph';
import * as path from 'path';
import { AnalyzedType, DtoAnalyzer } from '../utils/DtoAnalyzer';
import { extractFileFields, fallbackFileField, FileFieldInfo } from '../utils/FileUploadExtractor';
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
  private project: Project | null = null;
  private dtoAnalyzer = new DtoAnalyzer();

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
        this.project = new Project({
          skipAddingFilesFromTsConfig: true,
        });
      } else {
        this.project = new Project({
          tsConfigFilePath: tsconfigPath,
          skipAddingFilesFromTsConfig: true,
        });
      }
    } catch (error) {
      ScrambleLogger.warn(`Error initializing ts-morph project: ${error}`);
      this.project = new Project({
        skipAddingFilesFromTsConfig: true,
      });
    }

    if (!this.project) {
      ScrambleLogger.error('Failed to initialize project scanner');
      return [];
    }

    try {
      // ts-morph globs use forward slashes even on Windows.
      const pattern = `${fullSourcePath.replace(/\\/g, '/')}/**/*.ts`;
      ScrambleLogger.debug(`Adding source files with pattern: ${pattern}`);
      this.project.addSourceFilesAtPaths(pattern);
    } catch (error) {
      ScrambleLogger.error(`Error adding source files: ${error}`);
      return [];
    }

    const sourceFiles = this.project.getSourceFiles();
    ScrambleLogger.debug(`Loaded ${sourceFiles.length} TypeScript file(s)`);

    const controllers: ControllerInfo[] = [];

    const controllerClasses = sourceFiles
      .flatMap(file => file.getClasses())
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

  /** True when the class carries a `@Controller()` decorator. */
  hasControllerDecorator(cls: ClassDeclaration): boolean {
    return cls.getDecorators().some(decorator => {
      const callExpression = decorator.getCallExpression();
      if (!callExpression) return false;
      const expression = callExpression.getExpression();
      return Node.isIdentifier(expression) && expression.getText() === 'Controller';
    });
  }

  /**
   * Extracts controller metadata from a class declaration.
   *
   * Public so that `IncrementalScannerService` can delegate to it. That service
   * used to carry its own copy of the extraction logic, which drifted: enabling
   * `useIncrementalScanning` silently produced documentation missing `@HttpCode`,
   * JSDoc summaries, and the `@All`/`@Options`/`@Head` verbs.
   */
  extractControllerInfo(cls: ClassDeclaration): ControllerInfo | null {
    const controllerDecorator = cls.getDecorators().find(decorator => {
      const callExpression = decorator.getCallExpression();
      if (!callExpression) return false;
      const expression = callExpression.getExpression();
      return Node.isIdentifier(expression) && expression.getText() === 'Controller';
    });

    if (!controllerDecorator) return null;

    const controllerPath = this.extractControllerPath(controllerDecorator) ?? '';
    const version = this.extractVersionDecorator(cls);
    const guardTypes = this.extractGuardTypes(cls);
    const hasGuards = guardTypes.length > 0;
    const isPublic = this.isPublicDecorator(cls);

    const methods: MethodInfo[] = [];

    for (const method of cls.getMethods()) {
      const methodInfo = this.extractMethodInfo(method);
      if (methodInfo) {
        methods.push(methodInfo);
      }
    }

    return {
      name: cls.getName() || 'UnknownController',
      path: controllerPath,
      methods,
      hasGuards,
      version,
      guardTypes,
      isPublic,
    };
  }

  private extractDecoratorArgument(decorator: Decorator): string | undefined {
    const callExpression = decorator.getCallExpression();
    if (!callExpression) return undefined;
    const args = callExpression.getArguments();
    if (args.length === 0) return '';
    const firstArg = args[0];
    if (Node.isStringLiteral(firstArg)) {
      return firstArg.getLiteralValue();
    }
    if (Node.isArrayLiteralExpression(firstArg)) {
      // `@Get(['a', 'b'])` registers several routes; the first is representative.
      const first = firstArg.getElements()[0];
      if (first && Node.isStringLiteral(first)) {
        return first.getLiteralValue();
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
  private extractControllerPath(decorator: Decorator): string | undefined {
    const callExpression = decorator.getCallExpression();
    if (!callExpression) return undefined;

    const args = callExpression.getArguments();
    if (args.length === 0) return '';

    const firstArg = args[0];

    if (Node.isObjectLiteralExpression(firstArg)) {
      const pathProp = firstArg.getProperty('path');
      if (pathProp && Node.isPropertyAssignment(pathProp)) {
        const initializer = pathProp.getInitializer();
        if (initializer && Node.isStringLiteral(initializer)) {
          return initializer.getLiteralValue();
        }
        if (initializer && Node.isArrayLiteralExpression(initializer)) {
          const first = initializer.getElements()[0];
          if (first && Node.isStringLiteral(first)) {
            return first.getLiteralValue();
          }
        }
      }
      // An object without a `path` means the controller is mounted at the root.
      return '';
    }

    return this.extractDecoratorArgument(decorator);
  }

  /** Reads the numeric argument of `@HttpCode(...)`. */
  private extractHttpCode(method: MethodDeclaration): number | undefined {
    const decorator = method.getDecorators().find(d => d.getName() === 'HttpCode');
    if (!decorator) return undefined;

    const args = decorator.getCallExpression()?.getArguments() ?? [];
    const first = args[0];

    if (first && Node.isNumericLiteral(first)) {
      return first.getLiteralValue();
    }

    // Supports `@HttpCode(HttpStatus.NO_CONTENT)`.
    if (first && Node.isPropertyAccessExpression(first)) {
      const statusName = first.getName();
      const known = HTTP_STATUS_NAMES[statusName];
      if (known !== undefined) return known;
    }

    return undefined;
  }

  /**
   * Splits the method JSDoc into a one-line summary and the remaining body,
   * which is far more useful in the docs UI than the raw method name.
   */
  private extractJsDoc(method: MethodDeclaration): { summary?: string; description?: string; deprecated?: boolean } {
    const jsDocs = method.getJsDocs();
    if (jsDocs.length === 0) return {};

    const deprecated = jsDocs.some(doc =>
      doc.getTags().some(tag => tag.getTagName() === 'deprecated'),
    );

    const text = jsDocs[0].getDescription().trim();
    if (!text) return { deprecated: deprecated || undefined };

    const [firstLine, ...rest] = text.split('\n');
    const body = rest.join('\n').trim();

    return {
      summary: firstLine.trim() || undefined,
      description: body || undefined,
      deprecated: deprecated || undefined,
    };
  }

  private extractVersionDecorator(node: ClassDeclaration | MethodDeclaration): string | string[] | undefined {
    const versionDecorator = node.getDecorators().find(decorator => {
      const callExpression = decorator.getCallExpression();
      if (!callExpression) return false;
      const expression = callExpression.getExpression();
      return Node.isIdentifier(expression) && expression.getText() === 'Version';
    });

    if (!versionDecorator) return undefined;

    const callExpression = versionDecorator.getCallExpression();
    if (!callExpression) return undefined;

    const args = callExpression.getArguments();
    if (args.length === 0) return undefined;

    const firstArg = args[0];

    if (Node.isStringLiteral(firstArg)) {
      return firstArg.getLiteralValue();
    }

    if (Node.isArrayLiteralExpression(firstArg)) {
      const versions: string[] = [];
      for (const element of firstArg.getElements()) {
        if (Node.isStringLiteral(element)) {
          versions.push(element.getLiteralValue());
        }
      }
      return versions.length > 0 ? versions : undefined;
    }

    return undefined;
  }

  private extractGuardTypes(node: ClassDeclaration | MethodDeclaration): string[] {
    const guardTypes: string[] = [];

    const useGuardsDecorators = node.getDecorators().filter(decorator => {
      const callExpression = decorator.getCallExpression();
      if (!callExpression) return false;
      const expression = callExpression.getExpression();
      return Node.isIdentifier(expression) && expression.getText() === 'UseGuards';
    });

    for (const decorator of useGuardsDecorators) {
      const callExpression = decorator.getCallExpression();
      if (!callExpression) continue;

      const args = callExpression.getArguments();
      for (const arg of args) {
        if (Node.isIdentifier(arg)) {
          guardTypes.push(arg.getText());
        }
        else if (Node.isCallExpression(arg)) {
          const expr = arg.getExpression();
          if (Node.isIdentifier(expr) && expr.getText() === 'AuthGuard') {
            const guardArgs = arg.getArguments();
            if (guardArgs.length > 0 && Node.isStringLiteral(guardArgs[0])) {
              const strategy = guardArgs[0].getLiteralValue();
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

  private isPublicDecorator(node: ClassDeclaration | MethodDeclaration): boolean {
    return node.getDecorators().some(decorator => {
      const callExpression = decorator.getCallExpression();
      if (!callExpression) return false;
      const expression = callExpression.getExpression();
      
      if (Node.isIdentifier(expression) && expression.getText() === 'Public') {
        return true;
      }

      if (Node.isIdentifier(expression) && expression.getText() === 'SetMetadata') {
        const args = callExpression.getArguments();
        if (args.length >= 2) {
          const firstArg = args[0];
          const secondArg = args[1];
          if (Node.isStringLiteral(firstArg) && firstArg.getLiteralValue() === 'isPublic') {
            if (secondArg.getText() === 'true') {
              return true;
            }
          }
        }
      }

      return false;
    });
  }

  private extractMethodInfo(method: MethodDeclaration): MethodInfo | null {
    const httpDecorator = method.getDecorators().find(decorator => {
      const callExpression = decorator.getCallExpression();
      if (!callExpression) return false;
      const expression = callExpression.getExpression();
      if (!Node.isIdentifier(expression)) return false;
      const decoratorName = expression.getText();
      return (HTTP_METHOD_DECORATORS as readonly string[]).includes(decoratorName);
    });

    if (!httpDecorator) return null;

    const callExpression = httpDecorator.getCallExpression()!;
    const expression = callExpression.getExpression() as any;
    const httpMethod = expression.getText().toUpperCase();
    const route = this.extractDecoratorArgument(httpDecorator) || '';

    const version = this.extractVersionDecorator(method);
    const guardTypes = this.extractGuardTypes(method);
    const hasGuards = guardTypes.length > 0;
    const isPublic = this.isPublicDecorator(method);

    const parameters: ParameterInfo[] = method.getParameters().map(param => {
      const decoratorText = param.getDecorators().map(d => d.getText()).join(' ');
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
        name: param.getName(),
        type: this.dtoAnalyzer.analyzeType(param.getType()),
        decorator: decoratorText,
        parameterLocation,
      };
    });

    const returnType = this.dtoAnalyzer.analyzeType(method.getReturnType());
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

    return {
      name: method.getName(),
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
    };
  }
}