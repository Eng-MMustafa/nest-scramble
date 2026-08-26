#!/usr/bin/env node
/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/

import * as fs from 'fs';
import * as path from 'path';
import { PostmanCollectionGenerator } from './generators/PostmanCollectionGenerator';
import { TypedClientGenerator } from './generators/TypedClientGenerator';
import { ScannerService } from './scanner/ScannerService';
import { OpenApiTransformer } from './utils/OpenApiTransformer';
import { diffSpecs } from './diff/SpecDiff';
import { DiffFormat, formatDiff } from './diff/DiffFormatter';
import { ScrambleLogger } from './utils/ScrambleLogger';
import { CliUsageError, CommandDef, formatHelp, parseCommand } from './utils/CliParser';

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

const COMMANDS = [generateCommand, initCommand, diffCommand];

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

      const { Project } = require('ts-morph');

      const modulePath = path.resolve(options.module);
      
      if (!fs.existsSync(modulePath)) {
        console.error(`❌ Module file not found: ${modulePath}`);
        console.error('💡 Try: nest-scramble init --module src/app.module.ts');
        process.exit(1);
      }

      console.log(`📂 Found module: ${modulePath}`);
      
      const project = new Project();
      const sourceFile = project.addSourceFileAtPath(modulePath);

      // Check if already imported
      const existingImport = sourceFile.getImportDeclaration(
        (imp: any) => imp.getModuleSpecifierValue() === 'nest-scramble'
      );

      if (existingImport) {
        console.log('⚠️  Nest-Scramble is already imported in this module');
        console.log('✅ No changes needed!');
        process.exit(0);
      }

      // Add import statement
      console.log('📝 Adding import statement...');
      sourceFile.addImportDeclaration({
        moduleSpecifier: 'nest-scramble',
        namedImports: ['NestScrambleModule'],
      });

      // Find the @Module decorator
      const classes = sourceFile.getClasses();
      const moduleClass = classes.find((cls: any) => 
        cls.getDecorator('Module') !== undefined
      );

      if (!moduleClass) {
        console.error('❌ Could not find @Module decorator');
        console.error('💡 Please add NestScrambleModule.forRoot() manually');
        process.exit(1);
      }

      const moduleDecorator = moduleClass.getDecorator('Module');
      const decoratorArgs = moduleDecorator?.getArguments();
      
      if (!decoratorArgs || decoratorArgs.length === 0) {
        console.error('❌ Module decorator has no arguments');
        process.exit(1);
      }

      const configObject = decoratorArgs[0];
      const configText = configObject.getText();

      // Add NestScrambleModule to imports array
      let newConfigText = configText;
      
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

      configObject.replaceWithText(newConfigText);

      // Save the file
      console.log('💾 Saving changes...');
      await sourceFile.save();

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