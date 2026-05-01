#!/usr/bin/env node
/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { PostmanCollectionGenerator } from './generators/PostmanCollectionGenerator';
import { TypedClientGenerator } from './generators/TypedClientGenerator';
import { ScannerService } from './scanner/ScannerService';
import { OpenApiTransformer } from './utils/OpenApiTransformer';

const packageJson = require('../package.json');

const program = new Command();

program
  .name('nest-scramble')
  .description('Zero-config API Documentation & Postman Generator for NestJS')
  .version(packageJson.version);

program
  .command('generate')
  .description('Generate API documentation from NestJS project')
  .argument('<sourcePath>', 'Path to the source directory (e.g., src)')
  .option('-o, --output <file>', 'Output file path', 'openapi.json')
  .option('-f, --format <type>', 'Output format: openapi, postman, or client', 'openapi')
  .option('-b, --baseUrl <url>', 'Base URL for the API', 'http://localhost:3000')
  .option('-t, --title <title>', 'API title', 'NestJS API')
  .option('-v, --apiVersion <version>', 'API version', '1.0.0')
  .action(async (sourcePath: string, options: { 
    output: string; 
    format: string;
    baseUrl: string;
    title: string;
    apiVersion: string;
  }) => {
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
        const transformer = new OpenApiTransformer(options.baseUrl);
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
  });

program
  .command('init')
  .description('Auto-inject Nest-Scramble into your NestJS project')
  .option('-m, --module <path>', 'Path to your app module', 'src/app.module.ts')
  .action(async (options: { module: string }) => {
    try {
      console.log('\n' + '='.repeat(60));
      console.log('🚀 Nest-Scramble Auto-Injector');
      console.log('   Developed by Mohamed Mustafa | MIT License');
      console.log('='.repeat(60) + '\n');

      const { Project } = require('ts-morph');
      const fs = require('fs');
      const path = require('path');

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
  });

program.parse();