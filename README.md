# Nest-Scramble

> Zero-config API Documentation & Postman Generator for NestJS using static analysis

[![npm version](https://badge.fury.io/js/nest-scramble.svg)](https://badge.fury.io/js/nest-scramble)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/Eng-MMustafa/nest-scramble.svg)](https://github.com/Eng-MMustafa/nest-scramble)
[![Author](https://img.shields.io/badge/Author-Mohamed%20Mustafa-blue.svg)](https://github.com/Eng-MMustafa)
[![NestJS Compatibility](https://img.shields.io/badge/NestJS-%3E%3D9.0.0-blue.svg)](https://docs.nestjs.com)

## 📋 What's New in v2.1.2

### ✅ Recent Fixes & Improvements
- **🔧 Fixed**: baseUrl configuration now properly displays in dashboard URLs
- **🔧 Updated**: Enhanced NestJS compatibility (>=9.0.0)
- **🔧 Improved**: Simplified reflect-metadata dependency
- **🎯 Feature**: Full baseUrl customization support

**Dashboard URLs now respect your configuration:**
```typescript
NestScrambleModule.forRoot({
  baseUrl: 'http://127.0.0.1:4444'  // ✅ Now works perfectly!
})
```

### 📖 Full Changelog
Check out the [CHANGELOG.md](CHANGELOG.md) for complete version history.

---

## 🚀 Why Nest-Scramble?

As a NestJS developer, I was tired of drowning in `@ApiProperty` decorators just to get basic API documentation. I longed for a zero-config solution where docs just worked without polluting my code. **Nest-Scramble changes that** by using static TypeScript analysis to automatically generate:

- ✅ **OpenAPI 3.0 specifications** from your DTOs
- ✅ **Interactive Scalar UI documentation** with zero configuration
- ✅ **Postman collections** with smart mock data
- ✅ **Live mocking** for rapid prototyping

**Zero configuration. Zero decorators. Just pure TypeScript.**

## 📖 The Story Behind Nest-Scramble

It all started with a vision: API documentation should be effortless. As a developer passionate about clean code and developer experience, I knew there had to be a better way than manual decorators and runtime reflection.

When I switched to NestJS for its powerful architecture and TypeScript-first approach, I was disappointed by the lack of zero-config documentation tools. Hours wasted on `@ApiProperty({ type: String })` instead of building features.

I knew there had to be a better way. Leveraging my expertise in static analysis and Abstract Syntax Trees (AST), I built Nest-Scramble to bring that same developer experience to the Node.js ecosystem. It's not just a tool—it's my mission to make API documentation as effortless as it should be.

## 🏆 Features Gallery

| Feature | Nest-Scramble | Swagger (@nestjs/swagger) |
|---------|---------------|---------------------------|
| Analysis Method | Static AST Traversal | Runtime Reflection |
| Performance Impact | Zero Overhead | Decorator Runtime Cost |
| Type Accuracy | Full TypeScript Inference | Partial Mapping |
| Circular References | Auto-Detected & Resolved | Manual Workarounds |
| Bundle Size | Minimal | Heavy with Decorators |
| Code Purity | Zero Decorators | Decorator Pollution |
| Future Compatibility | TypeScript Evolution Ready | Framework Dependent |

## 🧠 The Vision

Nest-Scramble embodies my engineering philosophy: **Clean Code through Automation**. As a developer who values TypeScript's type safety and NestJS's architecture, I believe that documentation should never compromise code quality.

This library represents a paradigm shift—from manual, error-prone decorators to intelligent, compile-time analysis. It's about empowering developers to focus on building features, not fighting frameworks.

## 🔬 How it's Built

Nest-Scramble is engineered using cutting-edge static analysis techniques that traditional tools cannot match:

- **Abstract Syntax Tree (AST) Traversal**: Direct manipulation of TypeScript's AST using `ts-morph` for unparalleled type inference
- **Zero-Decorator Architecture**: Pure TypeScript classes remain untouched, preserving domain integrity
- **Compile-Time Intelligence**: All analysis happens at build-time, eliminating runtime performance costs
- **Circular Reference Mastery**: Advanced algorithms detect and handle complex type relationships automatically

This approach delivers what runtime reflection simply cannot: perfect accuracy, zero overhead, and future-proof compatibility with TypeScript's evolving type system.

## ⚡ Quick Start - Zero Config (2 Steps!)

### Option A: Auto-Injection (Recommended - 30 seconds!)

```bash
# 1. Install
npm install nest-scramble

# 2. Auto-inject into your project
npx nest-scramble init

# 3. Start your app
npm run start:dev

# 🎉 Done! Visit http://localhost:3000/docs
```

The `init` command automatically:
- ✅ Adds the import statement to your `app.module.ts`
- ✅ Injects `NestScrambleModule.forRoot()` into your imports
- ✅ Uses smart defaults with zero configuration needed

### Option B: Manual Installation (3 Steps)

#### 1. Install the Package

```bash
# Using npm
npm install nest-scramble

# Using yarn
yarn add nest-scramble

# Using pnpm
pnpm add nest-scramble
```

#### 2. Import Module in Your NestJS App

**Zero-Config (Recommended):**
```typescript
import { Module } from '@nestjs/common';
import { NestScrambleModule } from 'nest-scramble';

@Module({
  imports: [
    NestScrambleModule.forRoot(), // 🎯 That's it! Zero config needed
  ],
})
export class AppModule {}
```

**With Custom Options:**
```typescript
import { Module } from '@nestjs/common';
import { NestScrambleModule } from 'nest-scramble';

@Module({
  imports: [
    NestScrambleModule.forRoot({
      sourcePath: 'src',              // Auto-detected by default
      baseUrl: 'http://localhost:3000', // Auto-detected from PORT env
      enableMock: true,               // Enabled by default
      autoExportPostman: false,       // Disabled by default
      apiTitle: 'My API',             // Auto-detected from package.json
      apiVersion: '1.0.0',            // Auto-detected from package.json
    }),
  ],
})
export class AppModule {}
```

#### 3. Start Your App and Visit Documentation

```bash
npm run start:dev
```

You'll see a beautiful dashboard in your terminal:

```
┌──────────────────────────────────────────────────────────┐
│  🚀 Nest-Scramble by Mohamed Mustafa is Active!          │
├──────────────────────────────────────────────────────────┤
│  📖 Docs: http://localhost:3000/docs                     │
│  📄 JSON: http://localhost:3000/docs-json                │
│  🎭 Mock: http://localhost:3000/scramble-mock            │
│  ✨ Scanning: src                                        │
│  🎯 Controllers: 5                                       │
└──────────────────────────────────────────────────────────┘
```

Then open your browser:

- **📖 Interactive API Docs (Scalar UI)**: http://localhost:3000/docs
- **📄 OpenAPI JSON Spec**: http://localhost:3000/docs-json
- **🎭 Mock Endpoints**: http://localhost:3000/scramble-mock/*

**That's it!** Nest-Scramble automatically:
- 🔍 Detects your project structure
- 📂 Finds your controllers
- 📝 Generates OpenAPI spec
- 🎨 Serves beautiful documentation
- 🎭 Provides mock endpoints

## 🔧 Compatibility & Requirements

### Supported Versions
- **NestJS**: `>=9.0.0` (v9.x, v10.x, and future versions)
- **Node.js**: `>=16.0.0`
- **TypeScript**: `>=4.5.0`
- **reflect-metadata**: `>=0.1.13` (optional)

### Package Managers
```bash
# npm
npm install nest-scramble

# yarn
yarn add nest-scramble

# pnpm
pnpm add nest-scramble
```

### Auto-Detection Features
Nest-Scramble automatically detects:
- ✅ Project structure and source directories
- ✅ API title and version from `package.json`
- ✅ Base URL from `PORT` and `HOST` environment variables
- ✅ TypeScript configuration and controller locations
- ✅ Dependencies and module relationships

## ⚙️ Configuration Options

```typescript
NestScrambleModule.forRoot({
  // Source directory to scan for controllers
  sourcePath: 'src',                    // default: 'src'

  // API base URL for OpenAPI spec and dashboard display
  baseUrl: 'http://localhost:3000',     // default: auto-detected from PORT/HOST env

  // Documentation path (customizable)
  path: '/docs',                        // default: '/docs'

  // Enable live mocking middleware
  enableMock: true,                     // default: true

  // Auto-export Postman collection on startup
  autoExportPostman: false,             // default: false

  // Postman collection output path
  postmanOutputPath: 'collection.json', // default: 'collection.json'

  // UI Theme options
  theme: 'futuristic',                  // 'classic' | 'futuristic' (default: 'futuristic')
  primaryColor: '#00f2ff',             // default: '#00f2ff'
  customDomainIcon: '',                 // default: ''

  // API metadata (auto-detected from package.json)
  apiTitle: 'My API',                   // default: auto-detected
  apiVersion: '1.0.0',                  // default: auto-detected

  // 🆕 Advanced Features
  useIncrementalScanning: false,        // Enable caching for faster startups
  enableWatchMode: false,               // Auto-regenerate on file changes
  cacheTtl: 24 * 60 * 60 * 1000,       // Cache TTL in milliseconds (24 hours)
})
```

### Configuration Details

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `sourcePath` | `string` | `'src'` | Directory where your NestJS controllers are located |
| `baseUrl` | `string` | `auto-detected` | Base URL for your API (used in OpenAPI spec and dashboard URLs) |
| `path` | `string` | `'/docs'` | Documentation endpoint path |
| `enableMock` | `boolean` | `true` | Enable `/scramble-mock/*` endpoints for testing |
| `autoExportPostman` | `boolean` | `false` | Automatically generate Postman collection file |
| `postmanOutputPath` | `string` | `'collection.json'` | Output path for Postman collection |
| `theme` | `string` | `'futuristic'` | UI theme: 'classic' or 'futuristic' |
| `primaryColor` | `string` | `'#00f2ff'` | Primary accent color for UI |
| `apiTitle` | `string` | `auto-detected` | API title (auto-detected from package.json) |
| `apiVersion` | `string` | `auto-detected` | API version (auto-detected from package.json) |
| `useIncrementalScanning` | `boolean` | `false` | Enable caching for faster startup times |
| `enableWatchMode` | `boolean` | `false` | Auto-regenerate docs on file changes |
| `cacheTtl` | `number` | `24h` | Cache time-to-live in milliseconds |

### 🎯 baseUrl Configuration

The `baseUrl` option is now properly respected in the dashboard display:

```typescript
// Example with custom baseUrl
NestScrambleModule.forRoot({
  baseUrl: 'http://127.0.0.1:4444',
  path: '/api-docs'
})
```

**Dashboard Output:**
```
┌──────────────────────────────────────────────────────────┐
│  ✨ NEST-SCRAMBLE by Mohamed Mustafa                      │
├──────────────────────────────────────────────────────────┤
│  ● Documentation                                           │
│    → http://127.0.0.1:4444/api-docs                      │
│  ● OpenAPI Spec                                            │
│    → http://127.0.0.1:4444/api-docs-json                 │
│  ● Mock Server                                             │
│    → http://127.0.0.1:4444/scramble-mock                 │
└──────────────────────────────────────────────────────────┘
```

## 🎭 Live Mocking Guide

Nest-Scramble provides **instant API mocking** without writing controllers:

### How It Works
1. Define your DTOs and controllers normally
2. Enable `enableMock: true`
3. All requests to `/scramble-mock/*` return smart mock data

### Example

**Controller:**
```typescript
@Controller('users')
export class UserController {
  @Get(':id')
  getUser(@Param('id') id: number): UserDto {
    // Your logic here
  }
}
```

**Mock Response:**
```bash
GET /scramble-mock/users/123
# Returns: { "id": 123, "name": "John Doe", "email": "john@example.com" }
```

**Smart Mocking Examples:**
- `email` → `faker.internet.email()`
- `name` → `faker.person.fullName()`
- `createdAt` → `faker.date.recent()`
- `posts` → Array of mock posts

![Live mocking demo](mock-demo.gif)

## 🔧 Advanced Usage

### CLI Generation

The Nest-Scramble CLI allows you to generate API documentation without running your NestJS application.

#### Generate OpenAPI Specification

```bash
# Using npx
npx nest-scramble generate src

# Using pnpm dlx
pnpm dlx nest-scramble generate src

# Using yarn dlx
yarn dlx nest-scramble generate src
```

#### CLI Options

```bash
nest-scramble generate <sourcePath> [options]

Options:
  -o, --output <file>         Output file path (default: "openapi.json")
  -f, --format <type>         Output format: openapi or postman (default: "openapi")
  -b, --baseUrl <url>         Base URL for the API (default: "http://localhost:3000")
  -t, --title <title>         API title (default: "NestJS API")
  -v, --apiVersion <version>  API version (default: "1.0.0")
  -h, --help                  Display help for command
```

#### Examples

**Generate OpenAPI JSON:**
```bash
pnpm dlx nest-scramble generate src --output openapi.json
```

**Generate Postman Collection:**
```bash
pnpm dlx nest-scramble generate src --format postman --output collection.json
```

**Custom API Details:**
```bash
pnpm dlx nest-scramble generate src \
  --output my-api.json \
  --title "My Awesome API" \
  --apiVersion "2.0.0" \
  --baseUrl "https://api.example.com"
```

**Check Version:**
```bash
pnpm dlx nest-scramble --version
```

### Programmatic API

Use Nest-Scramble programmatically in your Node.js scripts:

```typescript
import { ScannerService, OpenApiTransformer, PostmanCollectionGenerator } from 'nest-scramble';
import * as fs from 'fs';

// Scan controllers
const scanner = new ScannerService();
const controllers = scanner.scanControllers('src');

// Generate OpenAPI spec
const transformer = new OpenApiTransformer('http://localhost:3000');
const openApiSpec = transformer.transform(
  controllers,
  'My API',
  '1.0.0',
  'http://localhost:3000'
);

// Save to file
fs.writeFileSync('openapi.json', JSON.stringify(openApiSpec, null, 2));

// Or generate Postman collection
const postmanGen = new PostmanCollectionGenerator('http://localhost:3000');
const collection = postmanGen.generateCollection(controllers);
fs.writeFileSync('collection.json', JSON.stringify(collection, null, 2));
```

### CI/CD Integration

Add to your CI/CD pipeline to auto-generate documentation:

```yaml
# .github/workflows/docs.yml
name: Generate API Docs

on:
  push:
    branches: [main]

jobs:
  generate-docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npx nest-scramble generate src --output openapi.json
      - uses: actions/upload-artifact@v3
        with:
          name: api-docs
          path: openapi.json
```

## ⚡ Incremental Scanning & Advanced Caching (NEW!)

### 🚀 World-Class Performance Optimization

Nest-Scramble now includes a **production-grade incremental scanning system** with intelligent caching and dependency tracking. This delivers **10-100x faster** re-scans during development and ensures zero stale data even in large monorepos.

**Key Features:**
- 🔥 **Smart Caching** - MD5/SHA-256 hashing with file size verification
- 🔗 **Transitive Dependencies** - Tracks inheritance chains and indirect dependencies
- 🎯 **Partial AST Updates** - Only re-scans modified files and their dependents
- 💾 **Persistent Cache** - Survives restarts with `scramble-cache.json`
- 🛡️ **Hash Collision Detection** - Multi-layer verification prevents stale data
- 🧹 **Memory Management** - Proper cleanup for long dev sessions

### 📊 Performance Benchmarks

```
Traditional Scanner (no cache):     2000ms
Incremental Scanner (cold cache):   2100ms  (5% overhead for cache building)
Incremental Scanner (warm cache):   50ms    (40x faster!)
Single file update:                 20ms    (100x faster!)
DTO change (5 dependents):          100ms   (20x faster!)
```

### 🎯 Use Cases

**Development Mode:**
```typescript
import { WatchModeService } from 'nest-scramble';

const watchMode = new WatchModeService({
  sourcePath: 'src',
  outputPath: 'openapi.json',
  baseUrl: 'http://localhost:3000',
  useCache: true,  // Enable smart caching
});

await watchMode.start();
// ✅ Auto-regenerates docs on file changes
// ✅ Only re-scans affected files
// ✅ Tracks DTO inheritance chains
```

**Programmatic API with Caching:**
```typescript
import { IncrementalScannerService } from 'nest-scramble';

const scanner = new IncrementalScannerService({
  useCache: true,
  cacheFilePath: '.scramble-cache.json',
  // Optional: Use SHA-256 for large projects (>1000 files)
  // hashAlgorithm: 'sha256',
});

// Initialize and perform full scan
scanner.initialize('src');
const controllers = scanner.scanControllers('src');

// Process file changes incrementally
const changes = [
  { type: 'change', filePath: 'src/users.controller.ts', hash: '...' }
];
const results = scanner.processFileChanges(changes);

// Cleanup when done
scanner.cleanup();
```

### 🔗 Transitive Dependency Tracking

The system automatically tracks **inheritance chains** and **indirect dependencies**:

**Example Scenario:**
```typescript
// base.dto.ts
export class BaseDto {
  id: number;
  createdAt: Date;
}

// update-user.dto.ts
export class UpdateUserDto extends BaseDto {
  name: string;
  email: string;
}

// users.controller.ts
@Controller('users')
export class UsersController {
  @Put(':id')
  update(@Body() dto: UpdateUserDto) { }
}
```

**What happens when `BaseDto` changes:**
1. ✅ System detects `UpdateUserDto` inherits from `BaseDto`
2. ✅ System finds `UsersController` depends on `UpdateUserDto`
3. ✅ All three files are marked for re-scanning
4. ✅ **No stale data** - even with deep inheritance chains!

### 🔐 Hash Collision Prevention

Multi-layer verification system ensures **zero stale data**:

**Layer 1: Hash Comparison**
- MD5 (default) - Fast, suitable for most projects
- SHA-256 (optional) - More secure for large monorepos

**Layer 2: File Size Verification**
- Catches hash collisions automatically
- Triggers re-scan if size differs

**Layer 3: Collision Tracking**
- Monitors and logs collision events
- Auto-alerts after 3+ collisions
- Recommends switching to SHA-256

**Configuration:**
```typescript
const scanner = new IncrementalScannerService({
  useCache: true,
  hashAlgorithm: 'sha256',  // Use SHA-256 for large projects
});
```

### 📦 Cache Invalidation Strategy

The cache automatically invalidates when:
- ✅ Cache version mismatch (after library upgrade)
- ✅ TTL expiration (default: 24 hours, configurable)
- ✅ `tsconfig.json` changes
- ✅ File content hash changes
- ✅ File size differs (collision detection)
- ✅ File deletion
- ✅ DTO dependency changes
- ✅ Manual invalidation

**Custom TTL:**
```typescript
const cacheManager = new CacheManager({
  ttl: 12 * 60 * 60 * 1000,  // 12 hours
});
```

### 🎯 Best Practices

**1. Add Cache to .gitignore:**
```gitignore
# Nest-Scramble cache
scramble-cache.json
.scramble-cache.json
```

**2. Use Watch Mode in Development:**
```bash
# Terminal 1: Run your NestJS app
npm run start:dev

# Terminal 2: Run Nest-Scramble watch mode
npx nest-scramble watch src -o openapi.json
```

**3. Choose Hash Algorithm Based on Project Size:**
- **Small/Medium (<1000 files):** Use MD5 (default, fastest)
- **Large (>1000 files):** Use SHA-256 (more secure)
- **Monorepos (10k+ files):** Use SHA-256 + monitor collisions

**4. Monitor Cache Performance:**
```typescript
const stats = scanner.getCacheManager().getStats();
console.log(`Cache: ${stats.controllerCount} controllers`);
console.log(`Hash algorithm: ${stats.hashAlgorithm}`);
console.log(`Collisions: ${stats.hashCollisions}`);
console.log(`Size: ${(stats.cacheSize / 1024).toFixed(2)} KB`);
```

### 🧪 Advanced Examples

**Example 1: Dependency Analysis**
```typescript
import { DependencyTracker } from 'nest-scramble';

const tracker = scanner.getDependencyTracker();
const info = tracker.getDependencyInfo('src/users.controller.ts');

console.log('Dependencies:', info.dependencies);
console.log('Dependents:', info.dependents);
console.log('Inheritance chain:', info.inheritanceChain);
console.log('Transitive affected:', info.transitiveAffected);
```

**Example 2: Cache Performance Test**
```typescript
// See: src/examples/cache-performance-test.ts
import { runPerformanceTest } from 'nest-scramble/examples';

await runPerformanceTest();
// Compares traditional vs incremental scanning
// Shows real performance metrics
```

**Example 3: Hash Collision Detection**
```typescript
// See: src/examples/hash-collision-demo.ts
import { demonstrateHashCollisionDetection } from 'nest-scramble/examples';

await demonstrateHashCollisionDetection();
// Shows multi-layer verification in action
// Compares MD5 vs SHA-256 performance
```

### 📚 Additional Resources

- **[Advanced Dependency Tracking Example](./src/examples/advanced-dependency-tracking.ts)** - Transitive dependencies demo
- **[Hash Collision Demo](./src/examples/hash-collision-demo.ts)** - Multi-layer verification
- **[Cache Performance Test](./src/examples/cache-performance-test.ts)** - Benchmark comparisons
- **[Complete Integration Example](./src/examples/complete-integration-example.ts)** - Production-ready setup

## 🎨 Documentation UI - Professional API Dashboard

### ✨ Elite Dashboard Design (NEW!)

Nest-Scramble features a **professional, high-end API dashboard** inspired by Stripe and Postman, with refined typography and a polished dark palette for long reading sessions.

**🚀 Key Features:**
- **Sidebar-Only Navigation** - Fixed 320px sidebar with controller grouping
- **Single-Request Per Page** - Each endpoint gets its own dedicated view
- **Three-Column Elite Layout** - Information | Request Editor | Test Panel
- **Soft Dark Background** - Refined deep blues for a premium, eye-friendly dark mode
- **Cyber-Cyan Accents** - `#00f2ff` for active states and primary actions
- **Vibrant HTTP Method Badges** - Color-coded with glow effects:
  - GET = Royal Blue (`#3B82F6`)
  - POST = Emerald Green (`#10B981`)
  - PUT = Amber Orange (`#F59E0B`)
  - PATCH = Violet Purple (`#8B5CF6`)
  - DELETE = Vibrant Red (`#EF4444`)
- **Glassmorphism Effects** - Backdrop blur on request/response panels
- **40px Spacious Padding** - Premium whitespace throughout
- **Terminal-Style Response** - Black box with green text for API responses
- **High-Contrast Labels** - Required, Type, and Default badges
- **Custom Scrollbars** - Gradient cyan-to-purple styling
- **Plus Jakarta Sans Typography** - Modern, professional font family with optimized sizing
- **Clear Sidebar Text** - Slightly larger nav fonts for effortless scanning
- **Powered by Badge** - Animated branding with pulse effect

### 📐 Three-Column Elite Interface

The dashboard uses a professional three-column layout for each endpoint:

**Column 1 (Left) - Information Panel:**
- Endpoint title with large, bold typography
- HTTP method badge with vibrant colors and glow
- Endpoint description and documentation
- Clean parameters table with high-contrast labels
- Type information and required field indicators

**Column 2 (Middle) - Request Body Editor:**
- Glassmorphism design with backdrop blur
- Auto-filled mock data examples
- JSON editor with syntax highlighting
- Copy-to-clipboard functionality
- Real-time validation

**Column 3 (Right) - Test Request Panel:**
- Enhanced glassmorphism with cyan border glow
- Large "Send Request" button with gradient animation
- Terminal-style response viewer (black background, green text)
- Status code indicators
- Response headers display

### 🎨 Theme Customization

**Futuristic Theme (Default):**
```typescript
NestScrambleModule.forRoot({
  theme: 'futuristic',           // Professional dark dashboard
  primaryColor: '#00f2ff',       // Cyber-Cyan (default)
  customDomainIcon: '/logo.png', // Your brand favicon
  apiTitle: 'My Awesome API',
})
```

**Classic Theme:**
```typescript
NestScrambleModule.forRoot({
  theme: 'classic',              // Clean, light, professional
  primaryColor: '#0066cc',       // Corporate blue
  apiTitle: 'Enterprise API',
})
```

**Custom Color Branding:**
```typescript
// One line changes the entire UI color scheme!
NestScrambleModule.forRoot({
  primaryColor: '#a855f7',       // Electric Purple
  // or '#10b981' for Emerald Green
  // or '#f59e0b' for Amber Orange
  // or any hex color you want!
})
```

### 🎭 UI Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `theme` | `'classic' \| 'futuristic'` | `'futuristic'` | UI theme selection |
| `primaryColor` | `string` | `'#00f2ff'` | Primary accent color (hex) |
| `customDomainIcon` | `string` | `''` | Custom favicon URL |
| `apiTitle` | `string` | Auto-detected | API documentation title |
| `apiVersion` | `string` | Auto-detected | API version number |

### 🌟 Interactive Features

When you visit `http://localhost:3000/docs`, you'll experience:

- 🎯 **Single-Request Navigation** - Each endpoint on its own dedicated page
- 📂 **Controller Grouping** - Organized sidebar with uppercase section headers
- 🎨 **Active State Glow** - Cyber-cyan highlight for selected endpoints
- 📝 **Auto-generated Examples** - Pre-filled mock data in request editor
- 🧪 **Live Testing** - Send requests directly from the three-column interface
- 💻 **Terminal Response** - Black box with green text for authentic feel
- 🔍 **Quick Search** - Press 'K' to search endpoints instantly
- 📱 **Responsive Design** - Adapts to mobile, tablet, and desktop
- ✨ **Animated Branding** - Pulsing "Powered by Nest-Scramble" badge
- 🎭 **Developer Easter Eggs** - Check your browser console for surprises!

### 🖥️ Terminal Dashboard

The startup dashboard now features **gradient styling** with ANSI colors:

```
╔═══════════════════════════════════════════════════════════════╗
║  ✨ NEST-SCRAMBLE by Mohamed Mustafa                          ║
║  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ║
║                                                               ║
║  ● Documentation                                              ║
║    → http://localhost:3000/docs                               ║
║                                                               ║
║  ● OpenAPI Spec                                               ║
║    → http://localhost:3000/docs-json                          ║
║                                                               ║
║  ● Mock Server                                                ║
║    → http://localhost:3000/scramble-mock                      ║
║                                                               ║
║  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ║
║  📦 Source Path: src                                          ║
║  🎯 Controllers: 5                                            ║
║  🎨 Theme: Futuristic                                         ║
╚═══════════════════════════════════════════════════════════════╝
```

### 📚 More UI Documentation

For complete UI customization guide, see:
- **[UI_FEATURES.md](./UI_FEATURES.md)** - Comprehensive feature documentation
- **[examples/futuristic-ui-example.ts](./examples/futuristic-ui-example.ts)** - Usage examples

### Available Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /docs` | Interactive Scalar UI documentation |
| `GET /docs-json` | OpenAPI 3.0 JSON specification |
| `GET /docs/json` | Legacy endpoint (same as above) |
| `GET /docs/spec` | OpenAPI spec as JSON response |

### Accessing the OpenAPI Spec

You can use the OpenAPI JSON with other tools:

```bash
# Download the spec
curl http://localhost:3000/docs-json > openapi.json

# Use with Swagger UI
docker run -p 8080:8080 -e SWAGGER_JSON=/openapi.json -v $(pwd):/usr/share/nginx/html/openapi.json swaggerapi/swagger-ui

# Import into Postman
# File > Import > Link > http://localhost:3000/docs-json
```

## ✅ Supported Features

### Type Analysis
- ✅ Primitive types (string, number, boolean)
- ✅ Arrays and nested objects
- ✅ Union types
- ✅ Enums
- ✅ Optional properties
- ✅ Circular references (auto-detected)

### HTTP Methods
- ✅ GET, POST, PUT, DELETE, PATCH
- ✅ Path parameters (@Param)
- ✅ Query parameters (@Query)
- ✅ Request bodies (@Body)

### Code Generation
- ✅ Curl commands
- ✅ JavaScript Fetch
- ✅ TypeScript with types

## 🧪 Testing with Demo Controller

The library includes a `DemoController` with complex DTOs:

```typescript
// Complex DTOs with circular references
export class UserDto {
  id: number;
  name: string;
  email: string;
  role: UserRole; // Enum
  address: AddressDto; // Nested
  posts: PostDto[]; // Circular reference
}

export class PostDto {
  id: number;
  title: string;
  content: string;
  author: UserDto; // Circular reference
}
```

Run the demo to verify everything works perfectly.

## 🗺️ Roadmap

- [ ] GraphQL support
- [ ] Custom mock data providers
- [ ] Authentication integration
- [ ] API versioning
- [ ] Performance optimizations
- [ ] Plugin system for custom analyzers

## 🔧 Troubleshooting

### Common Issues

#### 1. **"No controllers found" Warning**

If you see this warning on startup:
```
[Nest-Scramble] No controllers found in /src. Please check your sourcePath config.
```

**Solution:**
- Ensure your `sourcePath` option points to the correct directory containing your controllers
- Check that your controllers use the `@Controller()` decorator from `@nestjs/common`
- Verify your project structure matches the configured path

```typescript
NestScrambleModule.forRoot({
  sourcePath: 'src', // Make sure this matches your project structure
})
```

#### 2. **UI Not Loading / Blank Page at /docs**

**Solution:**
- Clear your browser cache and hard refresh (Ctrl+Shift+R / Cmd+Shift+R)
- Check browser console for errors
- Verify the `/docs-json` endpoint returns valid JSON
- Ensure you're using version 2.1.2 or higher: `npm list nest-scramble`

#### 3. **TypeScript Compilation Errors**

If you get errors like `Cannot find module 'nest-scramble'`:

**Solution:**
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Rebuild your project
npm run build
```

#### 4. **"Unauthorized" (401) Error on /docs Endpoint**

If you have a Global AuthGuard and get 401 Unauthorized when accessing `/docs` or `/docs-json`:

**Solution:**

Nest-Scramble automatically marks its documentation endpoints as public using `@SetMetadata('isPublic', true)`. However, your AuthGuard needs to respect this metadata.

Update your AuthGuard to check for the `isPublic` metadata:

```typescript
import { Injectable, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);
    
    if (isPublic) {
      return true; // Allow access to public routes
    }
    
    return super.canActivate(context);
  }
}
```

**Alternative Solution - Exclude /docs path:**

```typescript
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

@Module({
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}

// In your AuthGuard:
canActivate(context: ExecutionContext) {
  const request = context.switchToHttp().getRequest();
  
  // Skip authentication for documentation endpoints
  if (request.url.startsWith('/docs')) {
    return true;
  }
  
  return super.canActivate(context);
}
```

#### 5. **pnpm Dependency Conflicts**

If using pnpm and getting peer dependency warnings:

**Solution:**
Nest-Scramble v1.1.0+ properly declares peer dependencies. Update to the latest version:
```bash
pnpm update nest-scramble
```

#### 6. **Controllers Not Being Scanned**

The scanner looks in your **host project's** `src` folder, not the library's folder.

**Diagnostic Steps:**
1. Check the startup logs - they show exactly where the scanner is looking:
   ```
   [Nest-Scramble] Scanning directory: /path/to/your/project/src
   [Nest-Scramble] Found X controller(s)
   ```

2. Ensure your controllers are in TypeScript files (`.ts`) not JavaScript (`.js`)

3. Verify your `tsconfig.json` exists in the project root

#### 7. **Mock Endpoints Not Working**

If `/scramble-mock/*` returns 404:

**Solution:**
- Ensure `enableMock: true` in your configuration
- The middleware applies to all routes matching `/scramble-mock/*`
- Example: `http://localhost:3000/scramble-mock/users/123`

#### 8. **OpenAPI Spec is Empty or Incomplete**

**Solution:**
- Ensure your DTOs are TypeScript classes or interfaces (not plain objects)
- Check that your controller methods have proper return type annotations
- Verify decorators are imported from `@nestjs/common`

```typescript
// ✅ Good - Explicit return type
@Get(':id')
getUser(@Param('id') id: string): UserDto {
  return this.userService.findOne(id);
}

// ❌ Bad - No return type
@Get(':id')
getUser(@Param('id') id: string) {
  return this.userService.findOne(id);
}
```

### Getting Help

If you're still experiencing issues:

1. **Check the logs** - Nest-Scramble provides detailed diagnostic output on startup
2. **Verify your version** - Run `npm list nest-scramble` (should be 2.1.2+)
3. **Open an issue** - [GitHub Issues](https://github.com/Eng-MMustafa/nest-scramble/issues)

When reporting issues, please include:
- Nest-Scramble version
- NestJS version
- Package manager (npm/yarn/pnpm)
- Startup logs
- Sample controller code

## 🤝 Contributing

We welcome contributions! Please:

1. Fork the repository
2. Create a feature branch
3. Add tests for new features
4. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) file.

## ‍💻 About the Author

![Mohamed Mustafa](https://via.placeholder.com/150x150?text=Mohamed+Mustafa)

Mohamed Mustafa is a passionate full-stack developer with a deep love for TypeScript and modern web frameworks. His mission is to build tools that enhance developer experience and eliminate repetitive tasks. When he's not crafting open-source libraries, you'll find him exploring new technologies, contributing to the developer community, or sharing insights through technical writing.

- [GitHub](https://github.com/Eng-MMustafa)
- [LinkedIn](https://www.linkedin.com/in/engmohammedmustafa/)
