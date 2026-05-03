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
| `npm test` | Run all 75 tests |
| `npm run test:ci` | Run tests with lcov coverage |
| `npm run lint` | ESLint check |
| `npm run lint:fix` | ESLint auto-fix |

---

## Running Tests

```bash
npm test
```

All tests live in `test/`. Please add or update tests for any changed behaviour. The CI pipeline runs on Node 18, 20, and 22 — ensure your changes pass on all.

---

## Submitting a Pull Request

1. Create a feature branch off `master`:
   ```bash
   git checkout -b feat/my-feature
   ```
2. Make your changes and add tests.
3. Run `npm run build && npm test` — both must pass.
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
