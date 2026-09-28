# Security Policy

We take security seriously. If you believe you have found a security vulnerability in `nest-scramble`, please follow the reporting guidelines below so we can investigate and fix it responsibly.

## Supported Versions

Security patches are released for the current major version line and the previous major version line during its transition window.

| Version | Status | Notes |
|---|---|---|
| 6.x | ✅ Active support | Secure-by-default release. Recommended for all new projects. |
| 5.8.x | ⚠️ Maintenance only | Receives critical security fixes until 6.x has been stable for 3 months. |
| 5.7.x and earlier | ❌ End-of-life | No longer supported; please upgrade to 6.x. |
| 4.x and below | ❌ End-of-life | No longer supported; please upgrade to 6.x. |

### About the 6.x secure-by-default change

Version 6.0.0 changes the default behavior of the in-app docs controller, mock server, and standalone proxy so that they are **disabled in production unless explicitly enabled**. If you are running an older version in production, please review the [Deployment Security Guide](README.md#deployment-security) and upgrade as soon as possible.

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.** Public issues can expose details before a fix is available and put users at risk.

### Preferred channel: GitHub Private Advisories

Report security issues privately using GitHub's built-in private vulnerability reporting:

👉 https://github.com/Eng-MMustafa/nest-scramble/security/advisories/new

This is the fastest way for us to triage, track, and coordinate a fix.

### Alternative channel: email

If you cannot use GitHub advisories, you may email the maintainer directly. Contact information is available on the [GitHub profile](https://github.com/Eng-MMustafa).

### What to include

A good report helps us respond quickly and accurately:

- A clear description of the vulnerability and its impact
- Steps to reproduce or a minimal proof-of-concept
- The affected version(s) and environment
- Any known workarounds
- A suggested fix, if you have one

## Response Timeline

These are our targets, not contractual SLAs, but we do our best to meet them for all responsibly disclosed issues.

| Action | Target |
|---|---|
| Initial acknowledgement | Within 72 hours |
| Severity assessment and reproduction | Within 7 days |
| Patch release (if confirmed and fixable) | Within 30 days |
| Public disclosure via GitHub Security Advisory | After a fix is released, unless a longer embargo is agreed on |

## Security-Related Configuration

The following options affect the security posture of the library. Please review them before deploying to production:

| Option | Recommendation |
|---|---|
| `enableDocs` | Disable (`false`) the in-app docs UI in production unless you intentionally want it publicly reachable. |
| `enableMock` | Disable (`false`) the mock server in production; it is intended for local development and CI. |
| `--proxy-allow-list` (standalone) | When running `serve`, restrict the proxy to known hosts/ports; never expose `serve` to the public internet. |

See the [README](README.md) for full configuration details.

## Disclosure Policy

- Confirmed vulnerabilities will be fixed in the oldest supported version that is affected, then merged forward.
- After a fix is released, we will publish a GitHub Security Advisory and add a note to the [CHANGELOG](CHANGELOG.md).
- We credit reporters who responsibly disclose issues, unless they prefer to remain anonymous.

## Scope

The following are generally in scope for security reports:

- The `nest-scramble` / `corvidjs` package code distributed on npm
- The self-contained docs UI, mock server, and proxy server
- The CLI tooling (`init`, `serve`, `export`, `generate`, `diff`, `doctor`, `test`)

The following are **out of scope** unless they directly affect the library:

- Security issues in your own application code or third-party dependencies
- Social engineering or phishing attempts
- Denial-of-service against a public demo instance that you do not operate

## Dependency Vulnerability Scanners

`nest-scramble` ships with **zero runtime dependencies**. Vulnerabilities reported by scanners such as Aikido, Snyk, or Dependabot in packages like `proxy-addr`, `multer`, `body-parser`, `qs`, `raw-body`, `fflate`, `file-type`, or `@nestjs/core` are almost always **transitive dependencies of peer or dev dependencies** (e.g. `@nestjs/platform-express`, `@nestjs/platform-fastify`, `express`, `fastify`) that your application installs itself.

Because we do not bundle these packages, we cannot patch them for you. If a scanner flags one:

1. Check whether it appears in `node_modules` because of a peer dependency (e.g. your NestJS/Express install) or because it is only used during development/testing of this library.
2. If it is a peer-dependency transitive, update your application's lockfile or the corresponding framework package.
3. If you believe a flagged package is actually bundled or used by `nest-scramble` itself at runtime, please report it as described above.

We keep `devDependencies` up to date where possible, but we will not cut a release solely to silence a transitive dev-only vulnerability that does not affect installed consumers.

## Path Traversal & Input Validation

The CLI and GitHub Action validate that relative source paths stay within the working directory. Absolute paths are still accepted when you intentionally want to scan outside the project. If you embed the library API directly, treat `sourcePath` as untrusted input and call the validation helpers exposed by the scanner modules.

Thank you for helping keep the community safe.
