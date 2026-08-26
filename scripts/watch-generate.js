const { ScannerService } = require('../dist/scanner/ScannerService');
const { PostmanCollectionGenerator } = require('../dist/generators/PostmanCollectionGenerator');
const { OpenApiTransformer } = require('../dist/utils/OpenApiTransformer');
const fs = require('fs');
const path = require('path');

const sourcePath = 'src';
const postmanOutput = 'collection.json';
const openApiOutput = 'openapi.json';
const baseUrl = 'http://localhost:3000';

function generate() {
  console.log('Regenerating API docs...');
  try {
    const scanner = new ScannerService();
    const controllers = scanner.scanControllers(sourcePath);

    // Generate Postman
    const postmanGen = new PostmanCollectionGenerator(baseUrl);
    const collection = postmanGen.generateCollection(controllers);
    fs.writeFileSync(postmanOutput, JSON.stringify(collection, null, 2));

    // Generate OpenAPI
    const transformer = new OpenApiTransformer(baseUrl);
    const openApi = transformer.transform(controllers);
    fs.writeFileSync(openApiOutput, JSON.stringify(openApi, null, 2));

    console.log('Generated collection.json and openapi.json');
  } catch (error) {
    console.error('Error generating docs:', error);
  }
}

// Initial generation
generate();

// Watch for changes (debounced: fs.watch fires several events per save)
let timer = null;
fs.watch(sourcePath, { recursive: true }, (_event, fileName) => {
  if (!fileName || !fileName.toString().endsWith('.ts')) return;
  console.log(`File ${fileName} changed, regenerating...`);
  clearTimeout(timer);
  timer = setTimeout(generate, 300);
});

console.log('Watching for changes in src/**/*.ts');