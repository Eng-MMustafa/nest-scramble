/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import { ClassDeclaration, Decorator, MethodDeclaration, Node, Project } from 'ts-morph';
import { AnalyzedType, DtoAnalyzer } from '../utils/DtoAnalyzer';

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
}

export interface ParameterInfo {
  name: string;
  type: AnalyzedType;
  decorator?: string;
  parameterLocation?: 'path' | 'query' | 'header' | 'body';
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
    const fullSourcePath = `${hostProjectRoot}/${sourcePath}`;
    const tsconfigPath = `${hostProjectRoot}/tsconfig.json`;

    console.log(`[Nest-Scramble] Scanning directory: ${fullSourcePath}`);
    console.log(`[Nest-Scramble] Using tsconfig: ${tsconfigPath}`);

    try {
      const fs = require('fs');
      if (!fs.existsSync(tsconfigPath)) {
        console.warn(`[Nest-Scramble] Warning: tsconfig.json not found at ${tsconfigPath}`);
        console.warn(`[Nest-Scramble] Creating project without tsconfig...`);
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
      console.warn(`[Nest-Scramble] Error initializing ts-morph project:`, error);
      this.project = new Project({
        skipAddingFilesFromTsConfig: true,
      });
    }

    if (!this.project) {
      console.error(`[Nest-Scramble] Failed to initialize project scanner`);
      return [];
    }

    try {
      const pattern = `${fullSourcePath}/**/*.ts`;
      console.log(`[Nest-Scramble] Adding source files with pattern: ${pattern}`);
      this.project.addSourceFilesAtPaths(pattern);
    } catch (error) {
      console.error(`[Nest-Scramble] Error adding source files:`, error);
      return [];
    }

    const sourceFiles = this.project.getSourceFiles();
    console.log(`[Nest-Scramble] Loaded ${sourceFiles.length} TypeScript file(s)`);

    const controllers: ControllerInfo[] = [];

    const controllerClasses = sourceFiles
      .flatMap(file => file.getClasses())
      .filter(cls => this.hasControllerDecorator(cls));

    if (controllerClasses.length === 0) {
      console.warn(`[Nest-Scramble] No controllers found in /${sourcePath}. Please check your sourcePath config.`);
      console.warn(`[Nest-Scramble] Searched in: ${fullSourcePath}`);
    } else {
      console.log(`[Nest-Scramble] Found ${controllerClasses.length} controller(s)`);
    }

    for (const controllerClass of controllerClasses) {
      const controllerInfo = this.extractControllerInfo(controllerClass);
      if (controllerInfo) {
        controllers.push(controllerInfo);
        console.log(`[Nest-Scramble]   - ${controllerInfo.name} (${controllerInfo.methods.length} endpoint(s))`);
      }
    }

    return controllers;
  }

  private hasControllerDecorator(cls: ClassDeclaration): boolean {
    return cls.getDecorators().some(decorator => {
      const callExpression = decorator.getCallExpression();
      if (!callExpression) return false;
      const expression = callExpression.getExpression();
      return Node.isIdentifier(expression) && expression.getText() === 'Controller';
    });
  }

  private extractControllerInfo(cls: ClassDeclaration): ControllerInfo | null {
    const controllerDecorator = cls.getDecorators().find(decorator => {
      const callExpression = decorator.getCallExpression();
      if (!callExpression) return false;
      const expression = callExpression.getExpression();
      return Node.isIdentifier(expression) && expression.getText() === 'Controller';
    });

    if (!controllerDecorator) return null;

    const controllerPath = this.extractDecoratorArgument(controllerDecorator) || '';
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
    return undefined;
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
      return ['Get', 'Post', 'Put', 'Delete', 'Patch'].includes(decoratorName);
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
      let parameterLocation: 'path' | 'query' | 'header' | 'body' | undefined;

      if (decoratorText.includes('@Body')) {
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
    };
  }
}