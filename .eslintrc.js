/**
 * ESLint 8 configuration.
 *
 * `npm run lint` and `npm run lint:fix` were listed in CONTRIBUTING.md and in
 * package.json, but no configuration file existed, so both commands failed for
 * anyone who followed the contributor guide. The `eslint-disable no-console`
 * comment in ScrambleLogger shows a config used to exist and was lost.
 *
 * Written as JavaScript rather than JSON so each exception can say why it is
 * there; an undocumented override is the kind of thing a later maintainer
 * removes "as cleanup" and then spends an afternoon rediscovering.
 *
 * @type {import('eslint').Linter.Config}
 */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  env: {
    node: true,
    es2022: true,
  },
  // Demonstration material: kept in the repository as a reference, excluded
  // from the build and from the published package, so it is not held to the
  // same rules as shipped code.
  ignorePatterns: [
    'dist/',
    'node_modules/',
    'coverage/',
    'examples/',
    'src/examples/',
    'src/controllers/DemoController.ts',
  ],
  rules: {
    // Library output must go through ScrambleLogger so that `logLevel: 'silent'`
    // can actually silence it and structured-logging hosts stay parseable.
    'no-console': 'error',
    'no-debugger': 'error',
    eqeqeq: ['error', 'smart'],
    'prefer-const': 'error',
    'no-var': 'error',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],

    // The scanner walks untyped AST data and NestJS metadata, where `any` is
    // the honest type. Banning it here would only produce casts that hide the
    // same uncertainty behind a more confident-looking name.
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
  },
  overrides: [
    {
      files: ['test/**/*.ts'],
      env: { jest: true },
      rules: {
        'no-console': 'off',
      },
    },
    {
      // Writing to stdout is what a CLI is for, not a mistake. The `diff`
      // command's JSON output is piped by CI, and that is only possible
      // because it prints directly.
      files: ['src/cli.ts'],
      rules: {
        'no-console': 'off',
      },
    },
    {
      // Optional peer dependencies (chokidar) and the host's own TypeScript are
      // resolved lazily with `require`, so that importing this package never
      // throws when they are absent. A static import would defeat that.
      files: [
        'src/watcher/*.ts',
        'src/tracker/DependencyTracker.ts',
        'src/scanner/ScannerService.ts',
      ],
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
      },
    },
    {
      // Reads its own package.json for `--version`, which a static import would
      // pull into the build output and shift every emitted path by one level.
      files: ['src/cli.ts'],
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
      },
    },
  ],
};
