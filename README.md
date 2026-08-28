# 🚀 Nest-Scramble

> **The zero-config API platform for NestJS** — living documentation, live consoles for REST + WebSocket + GraphQL, contract testing, drift detection and typed SDKs. All from static TypeScript analysis. **You never write a single annotation.**

[![npm version](https://badge.fury.io/js/nest-scramble.svg)](https://www.npmjs.com/package/nest-scramble)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![NestJS Compatibility](https://img.shields.io/badge/NestJS-10%20%7C%2011-e0234e.svg)](https://docs.nestjs.com)
[![Adapters](https://img.shields.io/badge/adapters-Express%20%7C%20Fastify-blue.svg)](https://docs.nestjs.com/techniques/performance)
[![Zero Dependencies](https://img.shields.io/badge/runtime%20dependencies-0-brightgreen.svg)](https://www.npmjs.com/package/nest-scramble)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.10.0-brightgreen.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/typescript-5%20%7C%206-blue.svg)](https://www.typescriptlang.org)
[![Author](https://img.shields.io/badge/Author-Mohamed%20Mustafa-blue.svg)](https://github.com/Eng-MMustafa)

<p align="center">
  <img src="https://raw.githubusercontent.com/Eng-MMustafa/nest-scramble/master/assets/docs-overview.png" alt="Nest-Scramble documentation overview" width="900" />
</p>

---

## Why Nest-Scramble?

Every other tool makes you decorate your code to death: `@ApiProperty()`, `@ApiResponse()`, `@ApiTags()` on every line. **Nest-Scramble reads your TypeScript instead.**

| | Swagger / @nestjs/swagger | **Nest-Scramble** |
|---|---|---|
| Setup | Decorators on every DTO & route | **One CLI command** |
| Return types | `@ApiResponse` per status | **Inferred — even `return { total, items }` with no annotation** |
| Validation docs | `@ApiProperty` duplicating rules | **Read from `class-validator` automatically** |
| Error responses | Manual `@ApiResponse({ status: 404 })` | **Extracted from your `throw` statements** |
| WebSockets | Not covered | **Scanned + live multi-user console** |
| GraphQL | Separate tooling | **Scanned + live query console** |
| Contract testing | Not covered | **Generated scenarios, drift detection, CI diff gate** |
| Runtime dependencies | Several | **Zero** |

Everything below is discovered **automatically** from your source code. No decorators. No YAML. No config files.

---

## Quick Start — 30 seconds, zero lines of code

```bash
npm install nest-scramble
npx nest-scramble init      # injects the module into app.module.ts for you
npm run start:dev           # open http://localhost:3000/docs
```

That's it. `init` writes the one required line into your `AppModule`:

```typescript
NestScrambleModule.forRoot({ path: '/docs', sourcePath: 'src' })
```

The scanner walks your TypeScript AST and produces the full documentation, consoles, mock server and OpenAPI 3.0 document — **before your app even finishes booting.**

---

## 🧭 The Postman-style Workspace

A complete, self-contained API client served at `/docs` — **no CDN, no external fonts, works offline**.

<p align="center">
  <img src="https://raw.githubusercontent.com/Eng-MMustafa/nest-scramble/master/assets/docs-request.png" alt="Request builder with auto-generated body and real 201 response" width="900" />
</p>

- **Smart request bodies** — generated from your DTOs with realistic values: `customerEmail` becomes a real email, nested `shippingAddress` and `items[]` arrays are fully assembled, and numbers **respect your `@Min`/`@Max` constraints**. Hit Send and get a real `201 Created`.
- **Params · Auth · Headers · Body · Docs · Code tabs** — path/query params sync live with the URL bar, per-request or global auth (Bearer/API-key/Basic), generated snippets for curl, fetch, axios and more.
- **Environments & share links** — Postman-style `{{variables}}` with a base-URL per environment, and one-click links that encode the entire request in the URL hash.
- **Request history** and **Postman collection export**, straight from the topbar.

<p align="center">
  <img src="https://raw.githubusercontent.com/Eng-MMustafa/nest-scramble/master/assets/docs-params-light.png" alt="Query params synced with the URL, light theme" width="900" />
</p>

Everything you see was inferred: the enum values, the validation constraints (`minLength`, `minimum`, `format: email`), the `404`/`409` responses from your `throw new NotFoundException(...)` statements, and even envelopes returned without a type annotation.

---

## 🔌 WebSocket — scanned gateways + a live multi-user console

`@WebSocketGateway()` and `@SubscribeMessage()` handlers are scanned exactly like controllers: payload and response DTOs become schemas, served at `/docs-ws-json`, and the docs grow a **live console**.

<p align="center">
  <img src="https://raw.githubusercontent.com/Eng-MMustafa/nest-scramble/master/assets/ws-live.png" alt="Live WebSocket console: ack, broadcast and presence events with timestamps" width="900" />
</p>

- **Connect over Socket.IO or raw WebSocket** — the Socket.IO client is served by *your own server*, no CDN.
- **Press Send cold** and the console auto-connects, queues your event, and delivers it when the socket opens.
- **Everything is visible live**: your outgoing event ▲, the server ack ▼, broadcasts from other clients ▼, and system events — each timestamped, with a live event counter.

**It's genuinely multi-user.** Open two tabs (or send a share link to a teammate): when user A sends `chat.send`, user B sees the `chat.newMessage` broadcast instantly — joins, presence updates and message history included:

<p align="center">
  <img src="https://raw.githubusercontent.com/Eng-MMustafa/nest-scramble/master/assets/ws-two-users.png" alt="Second user receiving broadcasts live on the same channel" width="900" />
</p>

---

## ◈ GraphQL — scanned resolvers + a live query console

`@Resolver()`, `@Query()`, `@Mutation()` and `@Subscription()` are discovered statically — the resolver doesn't even need to be registered in a module for the docs to see it. Arguments and return types become schemas, an SDL sketch is generated per operation, and the document is served at `/docs-graphql-json`.

<p align="center">
  <img src="https://raw.githubusercontent.com/Eng-MMustafa/nest-scramble/master/assets/graphql-response.png" alt="GraphQL console with pre-filled query, variables and a real response" width="900" />
</p>

- Operations grouped by resolver in the sidebar with `QRY` / `MUT` / `SUB` badges.
- The **query editor is pre-filled** from the response schema, and **variables are pre-filled with realistic values** derived from the argument types — the query above filtered by `unreadOnly: true` without the user typing anything.
- Response with status and timing, right under the editors.

<p align="center">
  <img src="https://raw.githubusercontent.com/Eng-MMustafa/nest-scramble/master/assets/graphql-light.png" alt="GraphQL console in the light theme" width="900" />
</p>

---

## 🧪 Contract Testing — scenarios your API writes for itself

```bash
# Generate ready-to-run test scenarios from your source — one file per tag
npx nest-scramble test src --generate -o scenarios/

# Run them against a live server, with contract validation
npx nest-scramble test scenarios/ --spec src
```

The generator applies the heuristics a developer would:

- **Log in first** when a login endpoint with a token-shaped response exists, and thread the captured token through every request as a `Bearer` header — registration is ordered *before* the login that needs the account.
- **Create → list → read → update → delete**, with the created `id` captured and reused for the `/:id` routes.
- **Deterministic realistic bodies** from your documented schemas.
- **`matchesSpec` assertions**: every response is validated against the generated document — status, shape, types.

```
✅ Orders flow
   ✓ Log in with any /users email and password "SecurePassword123!". (201, 3 ms)
   ✓ Places an order — the total is computed server-side from the items. (201, 2 ms)
   ✓ Paginated order list — filter by status, page through results. (200, 2 ms)
   ✓ Attaches a PDF invoice to the order (multipart upload). (201, 4 ms)
   ✓ One order with its items and shipping address. (200, 1 ms)
   ✓ Moves an order through its lifecycle — cancelled orders are final. (200, 2 ms)
   ✓ Cancels and removes a pending order. (204, 2 ms)
```

Scenario files are plain JSON — chained requests, `{{variable}}` capture between steps, status/body assertions — commit them and run them in CI with a proper exit code.

---

## 🩺 Docs that police themselves

**Drift detection** *(opt-in)* — `enableDriftDetection: true` samples real JSON responses in development and warns, once per finding, when the running API disagrees with the documentation: missing fields, unexpected fields, type mismatches, undocumented routes and statuses.

**`nest-scramble doctor`** — a documentation health score (0–100) with the exact fix for every issue: opaque return types, untyped parameters, missing JSDoc, unvalidated body DTOs. `--min-score 80` turns it into a CI gate.

**`nest-scramble diff`** — compares two versions of your API (spec files *or* source checkouts) and classifies every change as breaking / warning / safe. `--fail-on-breaking` fails the pipeline before your consumers find out.

**`nest-scramble changelog`** — a consumer-facing Markdown changelog between any two API versions, breaking changes first.

---

## ⚙️ CI/CD — the repository doubles as a GitHub Action

```yaml
# .github/workflows/api-check.yml
name: API Check
on: [pull_request]

jobs:
  api-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }          # the diff needs the base branch
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - uses: Eng-MMustafa/nest-scramble@v5
        with:
          source: src
          base-ref: ${{ github.base_ref }}
          fail-on-breaking: 'true'
          min-score: '70'
```

Three `with:` lines give every pull request a **documentation health gate** and **breaking-change detection** against the base branch. Optional scenario tests against a booted app too — see [`examples/api-check.workflow.yml`](examples/api-check.workflow.yml).

---

## 🎭 Live Mock Server

Every documented route is served with generated data under `/scramble-mock` — including the routes you just wrote and haven't implemented yet. Front-end teams can build against the contract from day one.

```bash
curl http://localhost:3000/scramble-mock/orders
```

---

## 📦 Typed Client SDK & Postman export

```bash
# TypeScript client with real interfaces generated from your DTOs
npx nest-scramble generate src --format client -o api-client.ts

# Postman collection with example bodies
npx nest-scramble generate src --format postman -o collection.json

# Plain OpenAPI 3.0
npx nest-scramble generate src -o openapi.json
```

The generated client is dependency-free `fetch` code with one typed method per endpoint — inherited DTO properties, mapped types (`PartialType`, `PickType`…), generics (`PaginatedDto<UserDto>`) and enums all resolve to real TypeScript interfaces.

---

## What the scanner understands — automatically

- **Controllers & routes**: `@Get/@Post/@Put/@Patch/@Delete/@All/@Options/@Head`, object-form `@Controller({ path })`, `app.setGlobalPrefix()` via `globalPrefix`, `@HttpCode`.
- **Parameters**: `@Param`, `@Query` (scalar or DTO), `@Body`, `@Headers`, `@UploadedFile` → `multipart/form-data`.
- **Types**: DTO classes and interfaces, inheritance chains, `@nestjs/mapped-types` helpers, instantiated generics, enums, string-literal unions, `Promise<T>` unwrapping, arrays — **and anonymous inferred returns** like `return { total, items }`.
- **Validation**: `class-validator` decorators become schema constraints (`@IsEmail` → `format: email`, `@Min/@Max`, `@Length`, `@ArrayMinSize`, `@IsEnum`, `@IsOptional` …) and the generated example data satisfies them.
- **Errors**: `throw new NotFoundException('...')` documents a `404` with that exact message; all built-in `HttpException` subclasses plus `HttpStatus` enums are recognized.
- **JSDoc**: method comments become operation summaries/descriptions; `@deprecated` flags the operation.
- **WebSockets**: `@WebSocketGateway` options (port, namespace), `@SubscribeMessage` payloads and return types.
- **GraphQL**: `@Resolver`, `@Query`, `@Mutation`, `@Subscription`, `@Args` — with JSDoc and types.

Both **Express and Fastify** adapters are verified end-to-end in CI, on NestJS 10 and 11.

---

## Configuration

```typescript
NestScrambleModule.forRoot({
  path: '/docs',                  // docs URL
  sourcePath: 'src',              // where your controllers live
  apiTitle: 'My API',
  apiVersion: '1.0.0',
  baseUrl: 'http://localhost:3000',
  theme: 'futuristic',            // 'classic' (light) | 'futuristic' (dark)
  primaryColor: '#0ea5e9',
  enableMock: true,               // /scramble-mock/* mock server
  enableDriftDetection: false,    // runtime docs-vs-reality warnings (dev)
  globalPrefix: '',               // mirrors app.setGlobalPrefix()
  useIncrementalScanning: true,   // rescan only changed files in watch mode
})
```

| Endpoint | Purpose |
|----------|---------|
| `GET /docs` | The workspace UI |
| `GET /docs-json` | OpenAPI 3.0 document |
| `GET /docs-ws-json` | WebSocket gateways document |
| `GET /docs-graphql-json` | GraphQL resolvers document |
| `GET /scramble-mock/*` | Live mock server |

---

## CLI Reference

```bash
npx nest-scramble init                                   # inject the module — zero code written by you
npx nest-scramble generate src -o openapi.json           # OpenAPI | postman | client via --format
npx nest-scramble doctor src --min-score 80              # docs health gate
npx nest-scramble diff ./main/src ./src --fail-on-breaking
npx nest-scramble changelog ./v1/src ./src --to-label v2.0.0
npx nest-scramble test src --generate -o scenarios/      # write scenarios from the contract
npx nest-scramble test scenarios/ --spec src             # run them with contract validation
```

---

## Programmatic API

```typescript
import {
  ScannerService, OpenApiTransformer,       // source → OpenAPI
  diffSpecs, formatApiChangelog,            // contract diffing
  diagnose,                                  // docs health report
  generateScenarios, runScenario,            // contract testing
  scanGateways, buildWsDocument,             // WebSocket document
  scanResolvers, buildGraphQLDocument,       // GraphQL document
} from 'nest-scramble';
```

Every CLI feature is exported as a typed function — build your own tooling on top.

---

## What's New in v5.3.0

- **GraphQL support** — resolvers scanned statically, documented at `/docs-graphql-json`, with a live query console in the docs UI.
- **Scenario generation** — `nest-scramble test src --generate` writes runnable, contract-validated test flows derived from your API.
- **GitHub Action** — docs health gate + breaking-change detection for every PR in three lines.
- **Inferred return types documented** — `return { total, items }` without an annotation now produces the real schema everywhere.
- **Console UX overhaul** — responses and live events sit directly under the editors, realistic data is pre-filled for every console, and the WS console auto-connects on Send.

Full history in the [CHANGELOG](CHANGELOG.md).

---

## Requirements

- **Node.js** ≥ 18.10
- **NestJS** 10 or 11 (Express or Fastify)
- **TypeScript** ≥ 5.0 (your project's own compiler is used — it's a peer dependency)
- **Zero runtime dependencies** — installing nest-scramble adds ~0.8 MB

---

## Roadmap

Shipped: OpenAPI 3.0 from static AST · Postman-style workspace · typed client SDK · Postman export · live mock server · incremental scanning · `class-validator` constraints · error responses from `throw` · breaking-change diff · docs doctor · drift detection · declarative scenarios + generation · WebSocket console (multi-user) · GraphQL console · environments & share links · GitHub Action · Express + Fastify, NestJS 10 + 11.

Next: Insomnia/Bruno export · scenario recording from real traffic · GraphQL subscription execution over WS.

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new behaviour (627 tests keep this project honest)
4. Submit a pull request

## License

[MIT](LICENSE) © [Mohamed Mustafa](https://github.com/Eng-MMustafa)

Crafted with ❤️ for the NestJS community — if Nest-Scramble saves you time, a ⭐ on [GitHub](https://github.com/Eng-MMustafa/nest-scramble) helps others find it.
