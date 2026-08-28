#!/usr/bin/env node
/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/

import * as fs from 'fs';
import * as path from 'path';
import { PostmanCollectionGenerator } from './generators/PostmanCollectionGenerator';
import { TypedClientGenerator } from './generators/TypedClientGenerator';
import { ScannerService } from './scanner/ScannerService';
import { OpenApiTransformer } from './utils/OpenApiTransformer';
import { diffSpecs } from './diff/SpecDiff';
import { diagnose, formatDoctorReport } from './doctor/DocsDoctor';
import { formatApiChangelog } from './diff/ApiChangelog';
import { formatScenarioResult, runScenario, Scenario } from './runner/ScenarioRunner';
import { generateScenarios, scenarioFileName } from './runner/ScenarioGenerator';
import { DiffFormat, formatDiff } from './diff/DiffFormatter';
import { ScrambleLogger } from './utils/ScrambleLogger';
import { CliUsageError, CommandDef, formatHelp, parseCommand } from './utils/CliParser';
import { getDecoratorArguments, getDecoratorName, getDecorators } from './analysis/AstHelpers';

const packageJson = require('../package.json');

const generateCommand: CommandDef = {
  name: 'generate',
  description: 'Generate API documentation from NestJS project',
  positionals: ['sourcePath'],
  options: [
    { key: 'output', long: '--output', short: '-o', placeholder: '<file>', default: 'openapi.json', description: 'Output file path' },
    { key: 'format', long: '--format', short: '-f', placeholder: '<type>', default: 'openapi', description: 'Output format: openapi, postman, or client' },
    { key: 'baseUrl', long: '--baseUrl', short: '-b', placeholder: '<url>', default: 'http://localhost:3000', description: 'Base URL for the API' },
    { key: 'title', long: '--title', short: '-t', placeholder: '<title>', default: 'NestJS API', description: 'API title' },
    { key: 'apiVersion', long: '--apiVersion', short: '-v', placeholder: '<version>', default: '1.0.0', description: 'API version' },
    { key: 'globalPrefix', long: '--globalPrefix', short: '-p', placeholder: '<prefix>', default: '', description: 'Value passed to app.setGlobalPrefix(), prepended to every path' },
  ],
};

const initCommand: CommandDef = {
  name: 'init',
  description: 'Auto-inject Nest-Scramble into your NestJS project',
  positionals: [],
  options: [
    { key: 'module', long: '--module', short: '-m', placeholder: '<path>', default: 'src/app.module.ts', description: 'Path to your app module' },
  ],
};

const diffCommand: CommandDef = {
  name: 'diff',
  description: 'Compare two versions of your API and classify what changed',
  positionals: ['base', 'head'],
  options: [
    { key: 'format', long: '--format', short: '-f', placeholder: '<type>', default: 'text', description: 'Output format: text, json, or markdown' },
    { key: 'output', long: '--output', short: '-o', placeholder: '<file>', default: '', description: 'Write the report to a file instead of stdout' },
    { key: 'failOnBreaking', long: '--fail-on-breaking', boolean: true, description: 'Exit with code 1 when a breaking change is found' },
    { key: 'globalPrefix', long: '--globalPrefix', short: '-p', placeholder: '<prefix>', default: '', description: 'Value passed to app.setGlobalPrefix(), applied when generating from source' },
  ],
};

const doctorCommand: CommandDef = {
  name: 'doctor',
  description: 'Analyze documentation health and print a 0-100 score with actionable fixes',
  positionals: ['sourcePath'],
  options: [
    { key: 'json', long: '--json', boolean: true, description: 'Output the report as JSON' },
    { key: 'minScore', long: '--min-score', short: '-s', placeholder: '<n>', default: '', description: 'Exit with code 1 when the score is below this threshold (for CI)' },
  ],
};

const changelogCommand: CommandDef = {
  name: 'changelog',
  description: 'Generate a consumer-facing Markdown changelog between two API versions',
  positionals: ['base', 'head'],
  options: [
    { key: 'output', long: '--output', short: '-o', placeholder: '<file>', default: '', description: 'Write the changelog to a file instead of stdout' },
    { key: 'fromLabel', long: '--from-label', placeholder: '<label>', default: '', description: 'Label for the old version (defaults to the base path)' },
    { key: 'toLabel', long: '--to-label', placeholder: '<label>', default: '', description: 'Label for the new version (defaults to the head path)' },
    { key: 'globalPrefix', long: '--globalPrefix', short: '-p', placeholder: '<prefix>', default: '', description: 'Value passed to app.setGlobalPrefix(), applied when generating from source' },
  ],
};

const testCommand: CommandDef = {
  name: 'test',
  description: 'Run declarative API test scenarios (JSON) against a live server',
  positionals: ['scenarioPath'],
  options: [
    { key: 'baseUrl', long: '--baseUrl', short: '-b', placeholder: '<url>', default: '', description: 'Base URL of the running API (overrides the scenario file)' },
    { key: 'spec', long: '--spec', placeholder: '<path>', default: '', description: 'OpenAPI spec file or source directory for matchesSpec assertions' },
    { key: 'globalPrefix', long: '--globalPrefix', short: '-p', placeholder: '<prefix>', default: '', description: 'Value passed to app.setGlobalPrefix(), applied when generating the spec from source' },
    { key: 'generate', long: '--generate', boolean: true, description: 'Generate scenario files from the API instead of running: the positional becomes the spec file or source directory' },
    { key: 'output', long: '--output', short: '-o', placeholder: '<dir>', default: 'scenarios', description: 'Directory for generated scenario files (with --generate)' },
  ],
};

const COMMANDS = [generateCommand, initCommand, diffCommand, doctorCommand, changelogCommand, testCommand];

async function runGenerate(sourcePath: string, options: {
  output: string;
  format: string;
  baseUrl: string;
  title: string;
  apiVersion: string;
  globalPrefix: string;
}): Promise<void> {
    try {
      console.log('\n' + '='.repeat(60));
      console.log('🚀 Nest-Scramble CLI');
      console.log('   Developed by Mohamed Mustafa | MIT License');
      console.log('='.repeat(60) + '\n');

      console.log(`📂 Scanning controllers in: ${sourcePath}`);
      const scanner = new ScannerService();
      const controllers = scanner.scanControllers(sourcePath);

      if (controllers.length === 0) {
        console.log('❌ No controllers found.');
        console.log('💡 Make sure your controllers use @Controller() decorator');
        process.exit(1);
      }

      const methodCount = controllers.reduce((sum, c) => sum + c.methods.length, 0);
      console.log(`✅ Found ${controllers.length} controller(s) with ${methodCount} endpoint(s)\n`);

      const outputPath = path.resolve(options.output);

      if (options.format === 'postman') {
        console.log('📦 Generating Postman collection...');
        const generator = new PostmanCollectionGenerator(options.baseUrl);
        const collection = generator.generateCollection(controllers);
        fs.writeFileSync(outputPath, JSON.stringify(collection, null, 2));
        console.log(`✅ Postman collection saved to: ${outputPath}`);
      } else if (options.format === 'client') {
        console.log('🔷 Generating typed TypeScript client...');
        const clientGenerator = new TypedClientGenerator(options.baseUrl);
        const clientCode = clientGenerator.generate(controllers, packageJson.version);
        const clientOutput = options.output === 'openapi.json' ? 'api-client.ts' : outputPath;
        fs.writeFileSync(clientOutput, clientCode);
        console.log(`✅ Typed client saved to: ${clientOutput}`);
      } else {
        console.log('📄 Generating OpenAPI specification...');
        const transformer = new OpenApiTransformer(options.baseUrl, options.globalPrefix);
        const spec = transformer.transform(controllers, options.title, options.apiVersion, options.baseUrl);
        fs.writeFileSync(outputPath, JSON.stringify(spec, null, 2));
        console.log(`✅ OpenAPI spec saved to: ${outputPath}`);
      }

      console.log('\n' + '='.repeat(60));
      console.log('🎉 Generation complete!');
      console.log('='.repeat(60) + '\n');
    } catch (error) {
      console.error('\n❌ Error:', error instanceof Error ? error.message : error);
      console.error('\n💡 Troubleshooting:');
      console.error('   - Ensure the source path is correct');
      console.error('   - Check that tsconfig.json exists in your project root');
      console.error('   - Verify your controllers use @Controller() decorator\n');
      process.exit(1);
    }
}

async function runInit(options: { module: string }): Promise<void> {
    try {
      console.log('\n' + '='.repeat(60));
      console.log('🚀 Nest-Scramble Auto-Injector');
      console.log('   Developed by Mohamed Mustafa | MIT License');
      console.log('='.repeat(60) + '\n');

      const ts = require('typescript') as typeof import('typescript');

      const modulePath = path.resolve(options.module);

      if (!fs.existsSync(modulePath)) {
        console.error(`❌ Module file not found: ${modulePath}`);
        console.error('💡 Try: nest-scramble init --module src/app.module.ts');
        process.exit(1);
      }

      console.log(`📂 Found module: ${modulePath}`);

      const originalText = fs.readFileSync(modulePath, 'utf-8');
      const sourceFile = ts.createSourceFile(
        modulePath,
        originalText,
        ts.ScriptTarget.Latest,
        true,
      );

      // Check if already imported. An `import` declaration is the common case,
      // but projects that worked around older typings used
      // `require('nest-scramble')`, and a module that already references
      // `NestScrambleModule` must not receive a second `forRoot()`.
      const alreadyImported =
        sourceFile.statements.some(
          (statement) =>
            ts.isImportDeclaration(statement) &&
            ts.isStringLiteral(statement.moduleSpecifier) &&
            statement.moduleSpecifier.text === 'nest-scramble',
        ) ||
        /require\(\s*['"]nest-scramble['"]\s*\)/.test(originalText) ||
        originalText.includes('NestScrambleModule');

      if (alreadyImported) {
        console.log('⚠️  Nest-Scramble is already imported in this module');
        console.log('✅ No changes needed!');
        process.exit(0);
      }

      // Find the @Module decorator
      const moduleClass = sourceFile.statements
        .filter(ts.isClassDeclaration)
        .find((cls) =>
          getDecorators(cls).some((decorator) => getDecoratorName(decorator) === 'Module'),
        );

      if (!moduleClass) {
        console.error('❌ Could not find @Module decorator');
        console.error('💡 Please add NestScrambleModule.forRoot() manually');
        process.exit(1);
        return;
      }

      const moduleDecorator = getDecorators(moduleClass).find(
        (decorator) => getDecoratorName(decorator) === 'Module',
      )!;
      const decoratorArgs = getDecoratorArguments(moduleDecorator);

      if (decoratorArgs.length === 0) {
        console.error('❌ Module decorator has no arguments');
        process.exit(1);
        return;
      }

      // Rewrite the decorator's configuration object in place.
      const configObject = decoratorArgs[0];
      const configStart = configObject.getStart(sourceFile);
      const configEnd = configObject.getEnd();
      const configText = originalText.slice(configStart, configEnd);

      let newConfigText: string;
      if (configText.includes('imports:')) {
        // Add to existing imports array
        newConfigText = configText.replace(
          /imports:\s*\[/,
          'imports: [\n    NestScrambleModule.forRoot(),'
        );
      } else {
        // Create imports array
        newConfigText = configText.replace(
          /\{/,
          '{\n  imports: [NestScrambleModule.forRoot()],'
        );
      }

      // Add the import after the last existing import statement.
      console.log('📝 Adding import statement...');
      const importStatements = sourceFile.statements.filter(ts.isImportDeclaration);
      const importInsertAt =
        importStatements.length > 0
          ? importStatements[importStatements.length - 1].getEnd()
          : 0;
      const importLine = "import { NestScrambleModule } from 'nest-scramble';";

      const patchedText =
        originalText.slice(0, importInsertAt) +
        (importStatements.length > 0 ? '\n' + importLine : importLine + '\n') +
        originalText.slice(importInsertAt, configStart) +
        newConfigText +
        originalText.slice(configEnd);

      // Save the file
      console.log('💾 Saving changes...');
      fs.writeFileSync(modulePath, patchedText);

      console.log('\n' + '='.repeat(60));
      console.log('✅ Nest-Scramble successfully injected!');
      console.log('='.repeat(60));
      console.log('\n📋 Next steps:');
      console.log('   1. Run: npm run start:dev');
      console.log('   2. Visit: http://localhost:3000/docs');
      console.log('   3. Enjoy zero-config API documentation! 🎉\n');

    } catch (error) {
      console.error('\n❌ Error:', error instanceof Error ? error.message : error);
      console.error('\n💡 Manual installation:');
      console.error('   1. Import: import { NestScrambleModule } from "nest-scramble";');
      console.error('   2. Add to imports: NestScrambleModule.forRoot()');
      console.error('   3. Done! 🚀\n');
      process.exit(1);
    }
}

/**
 * Loads an OpenAPI document from either a spec file or a source directory.
 *
 * Generating from source is the reason this command can run anywhere: no
 * database, no environment variables, no booting the application.
 */
function loadSpec(target: string, globalPrefix: string): Record<string, any> {
  if (!fs.existsSync(target)) {
    throw new Error(`Path not found: ${target}`);
  }

  if (fs.statSync(target).isDirectory()) {
    const controllers = new ScannerService().scanControllers(target);
    return new OpenApiTransformer('http://localhost:3000', globalPrefix).transform(controllers);
  }

  return JSON.parse(fs.readFileSync(target, 'utf-8'));
}

function runDiff(
  base: string,
  head: string,
  options: { format: string; output?: string; failOnBreaking: boolean; globalPrefix: string },
): void {
      try {
        // Keep stdout clean so the report can be piped.
        ScrambleLogger.configure('error');

        const baseSpec = loadSpec(base, options.globalPrefix);
        const headSpec = loadSpec(head, options.globalPrefix);

        const result = diffSpecs(baseSpec, headSpec);
        const report = formatDiff(result, options.format as DiffFormat);

        if (options.output) {
          fs.writeFileSync(options.output, report);
          console.log(`Report written to: ${options.output}`);
        } else {
          console.log(report);
        }

        if (options.failOnBreaking && result.hasBreaking) {
          process.exitCode = 1;
        }
      } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
}

function runDoctor(sourcePath: string, options: { json: boolean; minScore: string }): void {
  try {
    ScrambleLogger.configure('error');

    const controllers = new ScannerService().scanControllers(sourcePath);

    if (controllers.length === 0) {
      console.error('❌ No controllers found. Make sure your controllers use @Controller().');
      process.exit(1);
    }

    const report = diagnose(controllers);

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(formatDoctorReport(report));
    }

    const threshold = options.minScore === '' ? undefined : Number(options.minScore);
    if (threshold !== undefined && !Number.isNaN(threshold) && report.score < threshold) {
      console.error(`\nScore ${report.score} is below the required minimum of ${threshold}.`);
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

function runChangelog(
  base: string,
  head: string,
  options: { output: string; fromLabel: string; toLabel: string; globalPrefix: string },
): void {
  try {
    ScrambleLogger.configure('error');

    const baseSpec = loadSpec(base, options.globalPrefix);
    const headSpec = loadSpec(head, options.globalPrefix);

    const result = diffSpecs(baseSpec, headSpec);
    const changelog = formatApiChangelog(result, {
      fromLabel: options.fromLabel || base,
      toLabel: options.toLabel || head,
    });

    if (options.output) {
      fs.writeFileSync(options.output, changelog);
      console.log(`Changelog written to: ${options.output}`);
    } else {
      console.log(changelog);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

/** Collects scenario files: a single file, or every `*.scenario.json` in a directory. */
function collectScenarioFiles(target: string): string[] {
  if (!fs.existsSync(target)) {
    throw new Error(`Path not found: ${target}`);
  }
  if (fs.statSync(target).isFile()) return [target];

  return fs
    .readdirSync(target)
    .filter((file) => file.endsWith('.scenario.json') || file.endsWith('.scenario'))
    .map((file) => path.join(target, file))
    .sort();
}

/** `test --generate`: writes one scenario file per tag, derived from the spec. */
function runGenerateScenarios(
  specPath: string,
  options: { baseUrl: string; globalPrefix: string; output: string },
): void {
  const spec = loadSpec(specPath, options.globalPrefix);
  const scenarios = generateScenarios(spec, { baseUrl: options.baseUrl || undefined });

  if (scenarios.length === 0) {
    console.error('No operations found to generate scenarios from.');
    process.exit(1);
  }

  fs.mkdirSync(options.output, { recursive: true });
  for (const scenario of scenarios) {
    const file = path.join(options.output, scenarioFileName(scenario));
    fs.writeFileSync(file, JSON.stringify(scenario, null, 2) + '\n');
    console.log(`✓ ${file}  (${scenario.steps.length} step(s))`);
  }

  console.log(`\n${scenarios.length} scenario(s) generated. Review the expectations, then run:`);
  console.log(`  npx nest-scramble test ${options.output} --spec ${specPath}`);
}

async function runTest(
  scenarioPath: string,
  options: { baseUrl: string; spec: string; globalPrefix: string; generate: boolean; output: string },
): Promise<void> {
  try {
    ScrambleLogger.configure('error');

    if (options.generate) {
      runGenerateScenarios(scenarioPath, options);
      return;
    }

    const files = collectScenarioFiles(scenarioPath);
    if (files.length === 0) {
      console.error(`No scenario files (*.scenario.json) found in: ${scenarioPath}`);
      process.exit(1);
    }

    const spec = options.spec ? loadSpec(options.spec, options.globalPrefix) : undefined;

    let failed = 0;
    for (const file of files) {
      const scenario = JSON.parse(fs.readFileSync(file, 'utf-8')) as Scenario;
      const result = await runScenario(scenario, {
        baseUrl: options.baseUrl || undefined,
        spec,
      });
      console.log(formatScenarioResult(result));
      console.log('');
      if (!result.passed) failed += 1;
    }

    console.log(`${files.length - failed}/${files.length} scenario(s) passed.`);
    if (failed > 0) process.exitCode = 1;
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    console.log(
      formatHelp(
        'nest-scramble',
        'Zero-config API Documentation & Postman Generator for NestJS',
        COMMANDS,
      ),
    );
    return;
  }

  if (argv.includes('--version') || argv[0] === '-V') {
    console.log(packageJson.version);
    return;
  }

  const commandName = argv[0];
  const def = COMMANDS.find((c) => c.name === commandName);

  try {
    if (!def) {
      throw new CliUsageError(`unknown command '${commandName}'`);
    }

    const { positionals, options } = parseCommand(def, argv.slice(1));

    if (def === generateCommand) {
      await runGenerate(positionals[0], options as Parameters<typeof runGenerate>[1]);
    } else if (def === initCommand) {
      await runInit(options as Parameters<typeof runInit>[0]);
    } else if (def === doctorCommand) {
      runDoctor(positionals[0], options as Parameters<typeof runDoctor>[1]);
    } else if (def === changelogCommand) {
      runChangelog(positionals[0], positionals[1], options as Parameters<typeof runChangelog>[2]);
    } else if (def === testCommand) {
      await runTest(positionals[0], options as Parameters<typeof runTest>[1]);
    } else {
      runDiff(positionals[0], positionals[1], options as Parameters<typeof runDiff>[2]);
    }
  } catch (error) {
    if (error instanceof CliUsageError) {
      console.error(`error: ${error.message}`);
      console.error(`Run 'nest-scramble --help' for usage.`);
      process.exit(1);
    }
    throw error;
  }
}

main();