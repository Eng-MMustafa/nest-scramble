/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import { ClassDeclaration, Decorator, MethodDeclaration, Node, Project } from 'ts-morph';
import { AnalyzedType, DtoAnalyzer } from '../utils/DtoAnalyzer';

export interface ControllerInfo {
  name: string;
  path: string;
  methods: MethodInfo[];
}

export interface MethodInfo {
  name: string;
  httpMethod: string;
  route: string;
  parameters: ParameterInfo[];
  returnType: AnalyzedType;
}

export interface ParameterInfo {
  name: string;
  type: AnalyzedType;
  decorator?: string;
}

export class ScannerService {
  private project: Project;
  private dtoAnalyzer = new DtoAnalyzer();

  constructor() {
    this.project = new Project({
      tsConfigFilePath: 'tsconfig.json',
      skipAddingFilesFromTsConfig: true,
    });
  }

  /**
   * Scans the source directory for controllers and their methods
   * @param sourcePath Path to the source directory (e.g., 'src')
   * @returns Array of ControllerInfo
   */
  scanControllers(sourcePath: string): ControllerInfo[] {
    const projectRoot = process.cwd();
    const fullSourcePath = `${projectRoot}/${sourcePath}`;
    
    try {
      this.project.addSourceFilesAtPaths(`${fullSourcePath}/**/*.ts`);
    } catch (error) {
      console.warn(`[Nest-Scramble] Warning: Could not add source files from ${fullSourcePath}`);
    }

    const controllers: ControllerInfo[] = [];

    const controllerClasses = this.project.getSourceFiles()
      .flatMap(file => file.getClasses())
      .filter(cls => this.hasControllerDecorator(cls));

    if (controllerClasses.length === 0) {
      console.warn(`[Nest-Scramble] No controllers found in /${sourcePath}. Please check your sourcePath config.`);
      console.warn(`[Nest-Scramble] Looking in: ${fullSourcePath}`);
    } else {
      console.log(`[Nest-Scramble] Found ${controllerClasses.length} controller(s) in /${sourcePath}`);
    }

    for (const controllerClass of controllerClasses) {
      const controllerInfo = this.extractControllerInfo(controllerClass);
      if (controllerInfo) {
        controllers.push(controllerInfo);
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

    const parameters: ParameterInfo[] = method.getParameters().map(param => ({
      name: param.getName(),
      type: this.dtoAnalyzer.analyzeType(param.getType()),
      decorator: param.getDecorators().map(d => d.getText()).join(' '),
    }));

    const returnType = this.dtoAnalyzer.analyzeType(method.getReturnType());

    return {
      name: method.getName(),
      httpMethod,
      route,
      parameters,
      returnType,
    };
  }
}