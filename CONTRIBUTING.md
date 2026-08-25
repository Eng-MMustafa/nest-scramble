# Contributing to nest-scramble

Thank you for taking the time to contribute! Every bit helps, whether it's a bug report, a feature idea, or a pull request.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Running Tests](#running-tests)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Commit Message Convention](#commit-message-convention)
- [Reporting Bugs](#reporting-bugs)
- [Requesting Features](#requesting-features)

---

## Code of Conduct

This project follows a [Contributor Code of Conduct](CODE_OF_CONDUCT.md). By participating you agree to abide by its terms.

---

## Getting Started

1. **Fork** the repository on GitHub.
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/<your-username>/nest-scramble.git
   cd nest-scramble
   ```
3. **Install** dependencies:
   ```bash
   npm install
   ```

---

## Development Setup

| Command | Purpose |
|---|---|
| `npm run build` | Compile TypeScript → `dist/` |
| `npm run dev` | Watch mode compilation |
| `npm test` | Unit suite |
| `npm run test:e2e` | Boots real NestJS apps and spawns the CLI — **requires `npm run build` first** |
| `npm run test:ci` | Unit suite with lcov coverage |
| `npm run verify:runtime-deps` | Fails if the entry point imports a dev-only dependency |
| `npm run lint` | ESLint check |
| `npm run lint:fix` | ESLint auto-fix |

---

## Running Tests

```bash
npm test                      # unit suite
npm run build && npm run test:e2e   # integration suite
```

Tests live in `test/`, with the integration suite under `test/e2e/`. The e2e suite
boots real NestJS applications on **both the Express and Fastify adapters** and
spawns the built CLI as a child process, so `dist/` must be up to date before it
runs.

Please add or update tests for any changed behaviour. CI runs the unit suite on
Node 18, 20 and 22, and the e2e suite against NestJS 10 and 11.

A few suites exist specifically to hold an invariant rather than a single case,
so prefer extending them over duplicating their intent:

- `test/ScannerParity.test.ts` — incremental and full scanning must agree exactly
- `test/e2e/module.e2e.test.ts` — the mock must answer on every documented path
- `test/e2e/cli.e2e.test.ts` — `--fail-on-breaking` must exit non-zero

---

## Submitting a Pull Request

1. Create a feature branch off `master`:
   ```bash
   git checkout -b feat/my-feature
   ```
2. Make your changes and add tests.
3. Run `npm run lint && npm run build && npm test && npm run test:e2e` — all must pass.
4. Push and open a PR against `master`.
5. Fill in the PR template completely.

---

## Commit Message Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>
```

| Type | When to use |
|---|---|
| `feat` | New feature |
| `fix` | Bug fix |
| `chore` | Build / tooling / config |
| `docs` | Documentation only |
| `test` | Adding or fixing tests |
| `refactor` | Code change with no behaviour change |
| `perf` | Performance improvement |

---

## Reporting Bugs

Please use the [Bug Report](.github/ISSUE_TEMPLATE/bug_report.md) issue template. Include:
- nest-scramble version
- Node.js version
- NestJS version
- A minimal reproduction

---

## Requesting Features

Open a [Feature Request](.github/ISSUE_TEMPLATE/feature_request.md) issue describing the use-case and expected behaviour.
