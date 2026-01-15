# Nest-Scramble

> Zero-config API Documentation & Postman Generator for NestJS using static analysis

[![npm version](https://badge.fury.io/js/nest-scramble.svg)](https://badge.fury.io/js/nest-scramble)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/Eng-MMustafa/nest-scramble.svg)](https://github.com/Eng-MMustafa/nest-scramble)
[![Author](https://img.shields.io/badge/Author-Mohamed%20Mustafa-blue.svg)](https://github.com/Eng-MMustafa)

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

## ⚡ Quick Start (3 Steps)

### 1. Install the Package

```bash
# Using npm
npm install nest-scramble

# Using yarn
yarn add nest-scramble

# Using pnpm
pnpm add nest-scramble
```

### 2. Import Module in Your NestJS App

Open your `app.module.ts` (or main module) and add:

```typescript
import { Module } from '@nestjs/common';
import { NestScrambleModule } from 'nest-scramble';

@Module({
  imports: [
    // Your other modules...
    NestScrambleModule.forRoot({
      sourcePath: 'src',           // Path to your source code
      baseUrl: 'http://localhost:3000',
      enableMock: true,            // Enable mock endpoints
      autoExportPostman: false,    // Auto-generate Postman collection
    }),
  ],
})
export class AppModule {}
```

### 3. Start Your App and Visit Documentation

```bash
npm run start:dev
```

Then open your browser:

- **📖 Interactive API Docs (Scalar UI)**: http://localhost:3000/docs
- **📄 OpenAPI JSON Spec**: http://localhost:3000/docs-json
- **🎭 Mock Endpoints**: http://localhost:3000/scramble-mock/*
- **📤 Postman Collection**: Auto-generated at `collection.json` (if enabled)

**That's it!** Nest-Scramble will automatically scan your controllers and generate beautiful documentation.

## ⚙️ Configuration Options

```typescript
NestScrambleModule.forRoot({
  // Source directory to scan for controllers
  sourcePath: 'src',                    // default: 'src'

  // API base URL for OpenAPI spec
  baseUrl: 'http://localhost:3000',     // default: 'http://localhost:3000'

  // Enable live mocking middleware
  enableMock: true,                     // default: true

  // Auto-export Postman collection on startup
  autoExportPostman: false,             // default: false

  // Postman collection output path
  postmanOutputPath: 'collection.json', // default: 'collection.json'
})
```

### Configuration Details

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `sourcePath` | `string` | `'src'` | Directory where your NestJS controllers are located |
| `baseUrl` | `string` | `'http://localhost:3000'` | Base URL for your API (used in OpenAPI spec) |
| `enableMock` | `boolean` | `true` | Enable `/scramble-mock/*` endpoints for testing |
| `autoExportPostman` | `boolean` | `false` | Automatically generate Postman collection file |
| `postmanOutputPath` | `string` | `'collection.json'` | Output path for Postman collection |

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
```bash
pnpm dlx nest-scramble generate src --output my-api.json
```

### Programmatic API
```typescript
import { ScannerService, OpenApiTransformer } from 'nest-scramble';

const scanner = new ScannerService();
const controllers = scanner.scanControllers('src');

const transformer = new OpenApiTransformer();
const spec = transformer.transform(controllers);
```

### Watch Mode
```bash
pnpm run watch-generate
```
Automatically regenerates docs on file changes.

## 🎨 Documentation UI

### Built-in Scalar UI

Nest-Scramble comes with **Scalar UI** built-in via CDN. No additional packages needed!

When you visit `http://localhost:3000/docs`, you'll see a beautiful, interactive API documentation interface with:

- 🎯 **Interactive API Explorer** - Test endpoints directly from the browser
- 📝 **Auto-generated Examples** - Request/response samples for all endpoints
- 🔍 **Search Functionality** - Quickly find endpoints
- 🌙 **Dark Mode Support** - Easy on the eyes
- 📱 **Mobile Responsive** - Works on all devices

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
- Ensure you're using version 1.1.0 or higher: `npm list nest-scramble`

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

#### 4. **pnpm Dependency Conflicts**

If using pnpm and getting peer dependency warnings:

**Solution:**
Nest-Scramble v1.1.0+ properly declares peer dependencies. Update to the latest version:
```bash
pnpm update nest-scramble
```

#### 5. **Controllers Not Being Scanned**

The scanner looks in your **host project's** `src` folder, not the library's folder.

**Diagnostic Steps:**
1. Check the startup logs - they show exactly where the scanner is looking:
   ```
   [Nest-Scramble] Scanning directory: /path/to/your/project/src
   [Nest-Scramble] Found X controller(s)
   ```

2. Ensure your controllers are in TypeScript files (`.ts`) not JavaScript (`.js`)

3. Verify your `tsconfig.json` exists in the project root

#### 6. **Mock Endpoints Not Working**

If `/scramble-mock/*` returns 404:

**Solution:**
- Ensure `enableMock: true` in your configuration
- The middleware applies to all routes matching `/scramble-mock/*`
- Example: `http://localhost:3000/scramble-mock/users/123`

#### 7. **OpenAPI Spec is Empty or Incomplete**

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
2. **Verify your version** - Run `npm list nest-scramble` (should be 1.1.0+)
3. **Open an issue** - [GitHub Issues](https://github.com/Eng-MMustafa/nest-scramble/issues)
4. **Join discussions** - [GitHub Discussions](https://github.com/Eng-MMustafa/nest-scramble/discussions)

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
