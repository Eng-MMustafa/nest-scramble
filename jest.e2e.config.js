/**
 * Separate config for end-to-end tests, which boot a real NestJS HTTP server.
 * Kept out of `npm test` so the unit suite stays fast, and run in CI against
 * both NestJS 10 and NestJS 11.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/test/e2e/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  // The scanner walks the filesystem and boots Nest per suite; serial execution
  // avoids port and ts-morph contention.
  maxWorkers: 1,
  testTimeout: 120000,
};
