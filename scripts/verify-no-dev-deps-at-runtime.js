#!/usr/bin/env node
/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/

/**
 * Regression guard for the bug shipped in v3.0.6.
 *
 * `src/index.ts` re-exported `FileWatcher`, which did a top-level
 * `import * as chokidar from 'chokidar'`. Because chokidar was a devDependency,
 * every production install (`npm ci --omit=dev`) crashed at startup with
 * `Cannot find module 'chokidar'`.
 *
 * This script imports the built entry point with module resolution hooked, and
 * fails if any devDependency gets required along the way.
 *
 * Run after `npm run build`.
 */

const Module = require('module');
const path = require('path');

const pkg = require('../package.json');

const runtimeSafe = new Set([
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.peerDependencies || {}),
]);

// Anything dev-only that is not also a declared runtime/peer dependency must
// never be reachable from the entry point.
const devOnly = new Set(
  Object.keys(pkg.devDependencies || {}).filter((name) => !runtimeSafe.has(name)),
);

// Optional peers are opt-in features: the entry point must not require them
// either, otherwise the "optional" contract is a lie.
const optionalPeers = new Set(
  Object.keys(pkg.peerDependenciesMeta || {}).filter(
    (name) => pkg.peerDependenciesMeta[name].optional && name !== 'reflect-metadata',
  ),
);

const forbidden = new Set([...devOnly, ...optionalPeers]);

const violations = new Set();
const originalResolve = Module._resolveFilename;

Module._resolveFilename = function (request, ...args) {
  const isBare = !request.startsWith('.') && !path.isAbsolute(request) && !request.startsWith('node:');

  if (isBare) {
    const packageName = request.startsWith('@')
      ? request.split('/').slice(0, 2).join('/')
      : request.split('/')[0];

    if (forbidden.has(packageName)) {
      violations.add(packageName);
    }
  }

  return originalResolve.call(this, request, ...args);
};

require('../dist/index.js');

Module._resolveFilename = originalResolve;

if (violations.size > 0) {
  console.error('\n[verify-runtime-deps] FAILED');
  console.error('  Importing "nest-scramble" required dependencies that consumers will not have:');
  for (const name of violations) {
    console.error(`    - ${name}`);
  }
  console.error('\n  Fix: require them lazily inside the feature that needs them,');
  console.error('  or promote them to "dependencies" in package.json.');
  console.error('  Otherwise `npm ci --omit=dev` installs crash at startup.\n');
  process.exit(1);
}

console.log(
  `[verify-runtime-deps] OK — entry point required none of the ${forbidden.size} dev-only/optional packages.`,
);
