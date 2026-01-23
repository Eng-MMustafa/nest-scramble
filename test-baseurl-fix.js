// Simple test to verify baseUrl fix
const { NestScrambleModule } = require('./dist/NestScrambleModule');

// Mock console.log to capture output
const originalConsoleLog = console.log;
let capturedOutput = [];

console.log = (...args) => {
    capturedOutput.push(args.join(' '));
};

// Test with custom baseUrl
const testOptions = {
    baseUrl: 'http://127.0.0.1:4444',
    path: '/docs',
    enableMock: true
};

// Set the module options directly (simulating what forRoot does)
NestScrambleModule.moduleOptions = testOptions;

// Create an instance to trigger onModuleInit
const moduleInstance = new NestScrambleModule();
moduleInstance.displayDashboard();

// Restore console.log
console.log = originalConsoleLog;

// Check if the output contains the correct baseUrl
const outputText = capturedOutput.join('\n');
console.log('=== Test Output ===');
console.log(outputText);
console.log('\n=== Verification ===');

if (outputText.includes('http://127.0.0.1:4444/docs')) {
    console.log('✅ SUCCESS: Documentation URL uses configured baseUrl');
} else {
    console.log('❌ FAILED: Documentation URL does not use configured baseUrl');
}

if (outputText.includes('http://127.0.0.1:4444/docs-json')) {
    console.log('✅ SUCCESS: OpenAPI Spec URL uses configured baseUrl');
} else {
    console.log('❌ FAILED: OpenAPI Spec URL does not use configured baseUrl');
}

if (outputText.includes('http://127.0.0.1:4444/scramble-mock')) {
    console.log('✅ SUCCESS: Mock Server URL uses configured baseUrl');
} else {
    console.log('❌ FAILED: Mock Server URL does not use configured baseUrl');
}

if (!outputText.includes('localhost:3000')) {
    console.log('✅ SUCCESS: No hardcoded localhost:3000 found');
} else {
    console.log('❌ FAILED: Hardcoded localhost:3000 still present');
}
