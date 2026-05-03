# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [3.0.6] - 2026-05-03

### Added
- GitHub Actions CI workflow (`.github/workflows/ci.yml`) — test matrix across Node 18, 20, and 22 with SonarCloud integration
- `sonar-project.properties` — SonarCloud project configuration with coverage path and exclusions
- `LICENSE` file (MIT) — required for package health scores and supply-chain tooling
- `CONTRIBUTING.md` — full contribution guide with commit convention and setup instructions
- `CODE_OF_CONDUCT.md` — Contributor Covenant v2.1
- `SECURITY.md` — private vulnerability disclosure policy and response timeline
- GitHub issue templates (bug report, feature request) and PR template
- `CHANGELOG.md` — this file

### Changed
- `package.json`: added `files` allowlist (`dist/`, `examples/`, `README.md`, `LICENSE`) — npm tarball no longer includes `coverage/`, test files, or `playground/`
- `package.json`: added `repository`, `homepage`, `bugs`, and `publishConfig` with `provenance: true`
- `package.json`: expanded keywords for better discoverability on npm
- `package.json`: added `test:ci` script with lcov reporter for SonarCloud
- `.gitignore`: exclude `coverage/` and loose debug files

---

## [3.0.5] - 2026-04-15

### Fixed
- **URL generation bug**: `buildUrlExpr` in `TypedClientGenerator` was running two sequential `.replace()` calls — after `:id` → `${id}`, the second regex matched `{id}` inside the result and produced `$${id}`. Fixed with a single combined regex pass using string concatenation for the template literal replacement.
- Added 2 regression tests to `test/TypedClientGenerator.test.ts` to prevent recurrence.

---

## [3.0.4] - 2026-04-10

### Added
- **TypedClientGenerator** (`src/generators/TypedClientGenerator.ts`) — generates a fully-typed, fetch-based TypeScript HTTP client from scanned NestJS controllers. Features:
  - Typed request/response interfaces per endpoint
  - Path parameter interpolation (`/users/:id` → template literals)
  - Optional `baseUrl` configuration
  - `--format client` CLI flag in `dist/cli.js`
- Exported `TypedClientGenerator` from `src/index.ts`
- Full test suite: `jest.config.js` + 4 test files (75 tests total)
  - `test/TypedClientGenerator.test.ts` (28 tests)
  - `test/OpenApiTransformer.test.ts` (17 tests)
  - `test/PostmanCollectionGenerator.test.ts` (15 tests)
  - `test/MockGenerator.test.ts` (15 tests)

### Changed
- README rewritten: removed duplication, reduced from ~1124 to ~482 lines, added TypedClientGenerator documentation

---

## [3.0.3] - 2026-03-01

### Added
- IncrementalScannerService for faster re-scans on file change
- DependencyTracker for cross-file DTO dependency resolution
- WatchModeService + FileWatcher for live reload in development
- CacheManager for scan result caching

---

## [3.0.0] - 2026-01-15

### Added
- NestJS 11 support
- Zero-decorator API scanning via ts-morph AST
- PostmanCollectionGenerator
- MockGenerator with @faker-js/faker smart data
- OpenApiTransformer (OpenAPI 3.0 schema output)
- DtoAnalyzer for nested DTO resolution
- AutoDetector for NestJS project root detection
- CLI (`nest-scramble --help`)
