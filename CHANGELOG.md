# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [4.0.0] - 2026-08-25

A major version because the typed client generator changes its output in a way that can
fail a consumer's build: the `[key: string]: unknown` index signature is gone, so code
that passed properties the DTO never declared no longer compiles. Nothing else here
requires action — the cache format also changed, but stale caches are discarded
automatically by their version stamp.

### Added
- **`nest-scramble diff <base> <head>`** — compares two versions of your API and
  classifies every change as breaking, warning or safe. Either side may be an OpenAPI
  JSON file **or a source directory**, so the check runs on a pull request with no
  database, no environment variables and no application boot.

  The classification is deliberately asymmetric: narrowing what the server *accepts*
  breaks callers, while narrowing what it *returns* breaks readers. A symmetric object
  diff reports both as "changed" and is useless as a gate. Concretely, a removed field is
  a warning on the request side and breaking on the response side; a field becoming
  optional is safe on the request side and breaking on the response side.

  Detected as breaking: removed path, operation or response status; new required field or
  parameter; a field becoming required; a tightened `maxLength`/`minLength`/`minimum`/
  `maximum`/`maxItems`/`minItems`; a newly added constraint or `pattern`; a removed enum
  value on a request; a changed type; and an endpoint that starts requiring
  authentication. `$ref`s are resolved on both sides, so a change inside a shared DTO is
  detected instead of hidden behind an unchanged reference, and self-referencing schemas
  terminate safely.

  Flags: `--fail-on-breaking` for CI, `--format text|json|markdown`, `--output`,
  `--globalPrefix`.
- **Fastify adapter support.** The library previously worked only on Express, even though
  NestJS treats Fastify as a first-class adapter: the docs controller called
  `res.setHeader()` and `res.status().json()`, which do not exist on a Fastify reply, and
  the mock middleware read `req.path`, which Fastify's raw request does not provide. The
  docs routes threw and the mock was unreachable.

  The fix is not adapter detection. The controller now uses Nest's declarative `@Header()`
  and returns its payload, and the middleware uses the raw Node HTTP API — both are
  understood by every adapter, so there is no branch that can be wrong. The e2e suite
  boots a real Fastify application and CI runs it against NestJS 10 and 11.

- **`multipart/form-data` upload support.** `@UploadedFile()` matched none of the parameter
  branches, so it was dropped silently and every upload endpoint was documented with **no
  request body at all** — impossible to call from the docs UI and invisible to the diff.

  The field name is read from the interceptor rather than the parameter, because
  `@UploadedFile()` only receives pipes: `FileInterceptor('avatar')`,
  `FilesInterceptor('photos', 10)`, `FileFieldsInterceptor([...])` and
  `AnyFilesInterceptor()` are all understood. A `@Body()` parameter on the same route is
  merged into the multipart schema, since multipart metadata travels as sibling form
  fields.

  Support reaches every consumer of the request body, not just the spec: the typed client
  builds `FormData` and types files as `File`/`File[]`, the Postman export switches to
  `formdata` mode with a file picker per field, and the contract diff now reads multipart
  bodies and flags a JSON ↔ multipart switch as breaking.

### Removed
- Three ad-hoc scratch files at the repository root: `build-and-publish.sh`,
  `test-baseurl-fix.js` and `test-dto-generation.ts`. All three were gitignored, never
  committed and never published, and nothing referenced them. The shell script predated
  the CI `publish` job that signs releases with provenance; `test-dto-generation.ts`
  asserted nothing at all; and `test-baseurl-fix.js` captured `console.log`, so after
  output moved to the NestJS logger it reported failure for behaviour that worked.

  Its intent is now covered permanently by `test/StartupBanner.test.ts`, which asserts
  the banner uses the configured `baseUrl` for the docs, spec and mock URLs, never falls
  back to a hard-coded `localhost:3000`, respects `enableMock` and `theme`, and stays
  silent above `logLevel: 'info'`.

### Fixed
- **The release pipeline could never run.** The `publish` job was complete — npm
  provenance, `id-token` permissions, the token, and a `refs/tags/v*` guard — but the
  workflow's `on.push` filter listed only `branches`. A tag ref matched nothing, so no
  run ever started and the guard was a condition that could not occur. Pushing
  `v3.2.0` reported success and released nothing.

  `tags: ['v*']` makes tag pushes run the full gate — unit tests on three Node versions
  and the e2e suite on NestJS 10 and 11 — instead of silently doing nothing.

  Publishing itself is now done by hand: the automated job authenticated with a
  repository secret, and a credential that only one person can rotate is a poor trade
  for the convenience. What CI still owes a tag is the check a person cannot do
  reliably — that the tag and `package.json` name the same version. `npm publish` uses
  `package.json`, not the tag, so a mismatch would release the wrong version under the
  right announcement, and npm does not allow a version number to be reused.
- **`npm run lint` had no configuration to run against.** Both `lint` and `lint:fix` were
  listed in `package.json` and recommended in `CONTRIBUTING.md`, ESLint and the
  TypeScript plugin were installed — but no config file existed, so a contributor
  following the guide got an error instead of a lint result. The `eslint-disable
  no-console` comment in `ScrambleLogger` shows a config once existed and was lost.

  `.eslintrc.js` restores it, written as JavaScript so each exception states its reason:
  `no-console` is an error everywhere except the CLI, whose job is to write to stdout,
  and `no-var-requires` is relaxed only where a lazy `require` is what keeps an optional
  peer dependency optional. The 18 genuine findings are fixed: five dead imports, a
  `let` that is never reassigned, a discarded return value, and two `require` calls in
  `cli.ts` that shadowed the imports directly above them.
- **89kB of demonstration material was compiled into `dist/` and published.** Six demo
  scripts under `src/examples/` and a `DemoController` that nothing referenced — not the
  barrel, not a test, not the docs — were built and shipped on every install, a third
  copy of sample data already covered by `test/fixtures` and `examples/`. They remain in
  the repository but are now excluded from the build and the tarball, which drops from
  193 files to 158. The intentional `examples/` directory the README links to still ships.
- **Five options were accepted, type-checked and then never read.**
  `enableWatchMode`, `watchDebounce`, `enableHashCollisionDetection`,
  `defaultAuthType` and `enableApiVersioning` had no effect whatsoever. Three of them
  were even copied into the internal config object, so `forRoot` *looked* like it
  handled them while nothing downstream ever read the result. Nothing failed: the
  caller set an option, observed no change, and had no way to find out why.

  They are kept on the type for backwards compatibility, but are now marked
  `@deprecated` with the working alternative, listed in the README, and — most
  usefully — **warn at startup** naming what to use instead. `test/OptionsContract.test.ts`
  asserts the structural property that ordinary tests cannot, since the defect is the
  *absence* of behaviour: every declared option must either be read somewhere in `src/`
  or appear in the ignored list, and the list may not name an option that has since been
  implemented.
- **Every shipped source map was broken.** `sourceMap` and `declarationMap` were enabled,
  so 74 map files — 38% of the unpacked package — were published, but `src/` was not in
  `files`. Each map therefore pointed at `../src/*.ts`, a path absent from the installed
  package: stepping into library code showed "source not found", and "Go to Definition"
  landed on a `.d.ts` instead of the real implementation. `src/` is now published, which
  makes the maps that were already being paid for actually work. `CHANGELOG.md` ships too.
- **`HOST=0.0.0.0` produced a documented server URL nobody could call.** The value was
  copied verbatim into `servers[].url` and the docs UI, but `0.0.0.0` is the address a
  server *binds* to, not one a client can *connect* to — so "Try it" in the docs pointed
  at an unreachable host. This is the default configuration in containers. Wildcard bind
  addresses (`0.0.0.0`, `::`, `[::]`, `::0`, `0`) are now rewritten to `localhost`.
- **An invalid `PORT` produced `http://localhost:NaN`.** The value went through
  `parseInt()` with no validation, so `PORT=abc` yielded `NaN` and `PORT=8080abc` was
  silently truncated to `8080`. The port is now validated as an integer in `1..65535`,
  falling back to `3000` with a warning.
- **Source auto-detection missed projects whose files are all nested.** The check for
  TypeScript files looked only at the top level of each candidate directory, so a layout
  such as `app/modules/users/users.controller.ts` was reported as empty and detection fell
  back to a `src` directory that did not exist — surfacing as "No controllers found" with
  nothing for the user to act on. The scan is now recursive (depth-limited), skips
  `node_modules`/`dist`/`build`/`coverage`/`.git`, and prefers a directory that actually
  declares a controller over one that merely contains TypeScript.
- **The contract diff was blind to `multipart/form-data`.** It read only
  `content['application/json']`, so a change to any upload body — including removing a
  required file field — passed the gate silently.
- **Absolute `sourcePath` values silently matched nothing.** Both scanners concatenated
  the given path onto `process.cwd()` unconditionally, so an absolute path became a
  nonsensical hybrid. This made it impossible to scan a directory outside the current
  project — exactly what `diff` needs in order to compare two checkouts. Paths are now
  resolved with `path.isAbsolute`, and glob patterns normalise Windows separators.

---

## [3.1.0] — folded into 4.0.0, never published separately

The entries below were completed before the 4.0.0 work started and ship in the same
release. They are kept as their own group because together they form one coherent
correctness pass over the v3.0.6 behaviour.

### Fixed
- **Production installs crashed on import.** `src/index.ts` re-exported `FileWatcher`,
  which imported `chokidar` at module load time while `chokidar` was declared only as a
  `devDependency`. Any consumer running `npm ci --omit=dev` failed at startup with
  `Cannot find module 'chokidar'`. `chokidar` is now an optional peer dependency loaded
  lazily inside `FileWatcher.start()`.
- **NestJS 11 / Express 5 incompatibility.** `configure()` registered the mock middleware
  with the anonymous wildcard `scramble-mock/*`, which `path-to-regexp` v8 rejects with
  `TypeError: Missing parameter name`. The pattern is now selected from the installed
  NestJS major version via `buildWildcardRoute()`.
- **The `path` option was ignored.** `DocsController` hard-coded `@Get('docs')`. Docs
  routes are now built at runtime by `createDocsController()`.
- **The `theme` option had no effect on the UI.** It only changed a console line. It now
  drives Scalar's `darkMode`.
- **The `customDomainIcon` option was never used.** It now renders a favicon link.
- **Optional nested DTOs lost their type name.** `address?: AddressDto` was analysed as
  the union `AddressDto | undefined`, producing `oneOf` noise in the OpenAPI schema and
  untyped client properties. Nullish union members are now stripped.
- **The CI workflow was invalid YAML.** The `publish` job key was missing, leaving
  duplicate `name`/`runs-on`/`steps` keys inside the `test` job, so no workflow ran.
- **`@Options`, `@Head` and `@All` routes were dropped entirely.** Only the five most
  common HTTP decorators were recognised, so those endpoints were silently absent from
  the document. `@All` now expands to the concrete verbs OpenAPI understands.
- **Object-form `@Controller({ path })` lost its base path.** Only the string form was
  parsed, so those controllers were documented at the root. Array form
  (`@Controller(['a', 'b'])`) is now handled too.
- **Status codes were always guessed from the HTTP verb.** `@HttpCode(204)` and
  `@HttpCode(HttpStatus.NO_CONTENT)` are now honoured, and a `204` response no longer
  advertises a response body.
- **Paths were wrong for any app using `app.setGlobalPrefix()`.** Static analysis cannot
  see `bootstrap()`, so the new `globalPrefix` option supplies it.
- **The mock server answered with the wrong endpoint's payload.** Routes were matched in
  scan order, so a `@Get(':id')` declared before `@Get('me')` swallowed every sibling
  literal route: `/users/me` returned the `:id` mock. The mock now ranks a literal
  segment above a path parameter, at any depth, independent of declaration order.
- **`@All()` routes were unreachable in the mock.** The stored verb `'ALL'` was compared
  directly against `req.method`, so it never matched anything. Verb comparison is also
  case-insensitive now.
- **The mock ignored `@HttpCode()`** and hard-coded `204` for `DELETE`, which does not
  match NestJS (the default is `200`). It also sent a JSON body alongside `204`, which is
  invalid. Bodiless statuses now end the response without one.
- **The mock ignored `@Version()` and `globalPrefix`,** so it returned 404 for the very
  paths the document advertised. Both are now honoured.
- **`MockMiddleware` injected `MockGenerator` without using it** — all its methods are
  static. The dead dependency was removed.
- **`/scramble-mockery/...` was treated as a mock request** because the prefix check did
  not require a segment boundary.
- **`useIncrementalScanning: true` silently produced worse documentation.**
  `IncrementalScannerService` carried a verbatim copy of the extraction logic frozen at
  an older revision, so enabling the flag dropped `@HttpCode`, JSDoc summaries,
  `@All`/`@Options`/`@Head` routes and object-form `@Controller({ path })`. The same
  source produced two different specs depending on a performance flag. Extraction is now
  delegated to `ScannerService`, and a parity test asserts both paths agree exactly.
- **The incremental scanner kept only the first controller per file.** Any file declaring
  more than one `@Controller()` class lost the rest from the document and the cache.
- **The cache was never invalidated by a library upgrade.** `CACHE_VERSION` was a
  hand-maintained constant unrelated to the package version, so upgrading nest-scramble
  kept reusing entries written by the older analyser: every newly supported decorator
  stayed missing until the user deleted `scramble-cache.json` by hand. The cache is now
  stamped with the installed library version.
- **`logLevel` did not silence most of the library.** The incremental scanner, cache
  manager, dependency tracker and watcher wrote directly to `console`, bypassing the
  logger — 69 call sites in total. All output now routes through `ScrambleLogger`, and a
  test asserts that `'silent'` produces no output on either `console` or the process
  streams.

### Added
- **`class-validator` constraint support.** `@IsEmail`, `@IsUUID`, `@IsUrl`,
  `@IsDateString` and friends map to `format`; `@MinLength`/`@MaxLength`/`@Length` to
  length bounds; `@Min`/`@Max` to `minimum`/`maximum`; `@IsPositive`/`@IsNegative` to
  exclusive bounds; `@IsInt` to `type: integer`; `@IsDivisibleBy` to `multipleOf`;
  `@Matches` to `pattern`; `@IsIn` to `enum`; `@ArrayMinSize`/`@ArrayMaxSize`/
  `@ArrayUnique` to array keywords. `@IsOptional` and `@IsNotEmpty`/`@IsDefined` now
  drive the `required` list, because the validation pipe rather than the TypeScript
  type decides what the API accepts. Decorators are read from the AST and never
  evaluated, so `class-validator` need not be installed.
- **Method JSDoc becomes real operation metadata** — first line as `summary`, the rest
  as `description`, and `@deprecated` as `deprecated: true`. Operations previously used
  the raw method name.
- **Stable `operationId`** on every operation, which client generators rely on.
- `globalPrefix` option, and a matching `--globalPrefix` CLI flag.
- End-to-end parity test asserting that the mock answers on **every** path the generated
  document advertises, with and without a global prefix. The two path builders drifting
  apart was the root cause of several of the bugs above, so the relationship is now
  asserted directly rather than case by case.
- `logLevel` option (`'silent' | 'error' | 'warn' | 'info' | 'debug'`). Library output now
  goes through the NestJS logger instead of raw `console.log` and can be silenced.
- `scalarUrl` option to self-host the Scalar bundle for air-gapped environments.
- End-to-end test suite that boots a real NestJS application (`npm run test:e2e`), run in
  CI against both NestJS 10 and NestJS 11.
- `npm run verify:runtime-deps` guard that fails the build if the package entry point
  requires a dev-only or optional dependency.
- Unit tests for `ScannerService`, `DtoAnalyzer`, `DocsPageRenderer`, `NestCompat`,
  `RoutePath`, `MockMiddleware` and `CacheManager`, which previously had no coverage at
  all.
- `IncrementalScannerService.scanFileAll()`, which reports every controller in a file.
  `scanFile()` remains as a deprecated wrapper returning the first.
- End-to-end tests for the CLI binary itself (`test/e2e/cli.e2e.test.ts`), which spawn the
  built `dist/cli.js` as a real process. The contract that needed protecting is the
  **exit code**: `--fail-on-breaking` is what a CI job keys off, and had it ever returned
  `0` on a breaking change every consumer's gate would have stopped working while still
  reporting success. An in-process test cannot verify that. The suite also asserts that
  `--format json` writes output clean enough to pipe, which is why library logging is
  lowered for the duration of a `diff`.
- Tests for `AutoDetector`, previously at 6% coverage despite supplying the default
  `sourcePath` and `baseUrl` for every user who does not configure them.
- `test/e2e/packaging.e2e.test.ts`, which asserts against the real `npm pack` manifest.
  A packaging mistake is the only defect that breaks *every* consumer at install time
  while the whole suite still passes, because tests run against the working tree rather
  than against what is published. It checks that `main`, `types` and `bin` all exist in
  the tarball, that each `bin` target keeps its shebang (without it `npx nest-scramble`
  fails on every Unix machine while working on Windows), that no test, fixture or CI file
  leaks, and that nothing is imported at runtime without being declared as a dependency.

### Changed
- **BREAKING (generated output):** the typed client no longer emits
  `export interface X { [key: string]: unknown; }` stubs, which silently accepted any
  property. Real interfaces are generated from the resolved DTO shapes, with nested
  types, optional properties, enums as string literal unions, and JSDoc comments.
  Types that cannot be resolved from the AST are emitted as `export type X = unknown;`
  so the missing information is visible rather than hidden.
- The Scalar CDN URL is pinned to a major version instead of tracking `latest`.
- The startup banner reports the configured source path and the number of scanned
  controllers, instead of re-running auto-detection and reporting unrelated values.
- `DocsController` is deprecated in favour of `createDocsController(config)`.
- Route building moved into a single shared `RoutePath` module. `OpenApiTransformer` and
  `MockMiddleware` each had their own copy, which is how the documented path and the
  mocked path came to disagree.
- **BREAKING (cache format):** `CachedController.controllerInfo` became
  `controllerInfos: ControllerInfo[]` so a file can hold several controllers. Existing
  cache files are discarded automatically by the version stamp; no manual step is needed.
- `ScannerService.extractControllerInfo()` and `hasControllerDecorator()` are now public
  so the incremental scanner can delegate instead of duplicating them.

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
