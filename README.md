# Nest-Scramble

> Zero-config API Documentation & Postman Generator for NestJS using static analysis

[![npm version](https://badge.fury.io/js/nest-scramble.svg)](https://badge.fury.io/js/nest-scramble)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/Eng-MMustafa/nest-scramble.svg)](https://github.com/Eng-MMustafa/nest-scramble)
[![Author](https://img.shields.io/badge/Author-Mohamed%20Mustafa-blue.svg)](https://github.com/Eng-MMustafa)

## 🚀 Why Nest-Scramble?

As a NestJS developer, I was tired of drowning in `@ApiProperty` decorators just to get basic API documentation. I longed for a zero-config solution where docs just worked without polluting my code. **Nest-Scramble changes that** by using static TypeScript analysis to automatically generate:

- ✅ **OpenAPI 3.0 specifications** from your DTOs
- ✅ **Postman collections** with smart mock data
- ✅ **Interactive documentation** with code samples
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

### 1. Install
```bash
pnpm add nest-scramble
```

### 2. Import Module
```typescript
// app.module.ts
import { NestScrambleModule } from 'nest-scramble';

@Module({
  imports: [
    NestScrambleModule.forRoot({
      enableMock: true,
      autoExportPostman: true,
    }),
  ],
})
export class AppModule {}
```

### 3. Visit Documentation
- **📖 API Docs**: http://localhost:3000/docs
- **🎭 Live Mocking**: http://localhost:3000/scramble-mock/users
- **📤 Postman Collection**: Auto-generated at `collection.json`

![Zero-config setup demo](demo.gif)

## ⚙️ Configuration API

```typescript
NestScrambleModule.forRoot({
  // Documentation path
  path: '/docs', // default: '/docs'

  // Enable live mocking
  enableMock: true, // default: true

  // Auto-export Postman collection
  autoExportPostman: true, // default: false

  // Output paths
  postmanOutputPath: 'collection.json',
  openApiOutputPath: 'openapi.json',

  // API base URL
  baseUrl: 'http://localhost:3000',

  // Source directory to scan
  sourcePath: 'src', // default: 'src'
})
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

## 🎨 UI Integration

### Using Scalar UI
For the modern Scalar documentation UI:

```typescript
import { ApiReference } from '@scalar/nestjs';

@Module({
  imports: [
    NestScrambleModule.forRoot(),
    ApiReference({
      path: '/docs',
      spec: {
        content: () => {
          const scanner = new ScannerService();
          const controllers = scanner.scanControllers('src');
          const transformer = new OpenApiTransformer();
          return transformer.transform(controllers);
        },
      },
    }),
  ],
})
export class AppModule {}
```

*Note: If `@scalar/nestjs` is not available, the default HTML UI is served.*

![Scalar UI demo](ui-demo.gif)

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

**TypeScript Path Mapping Issues:**
If you're using custom `tsconfig` paths, ensure the scanner can resolve them:
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

**Circular Reference Errors:**
Nest-Scramble auto-detects circular references, but if you encounter issues, simplify your DTOs or use interfaces instead of classes.

**Mock Data Not Generating:**
Ensure `@faker-js/faker` is installed and your property names follow common conventions (e.g., `email`, `name`).

For more help, check the [issues](https://github.com/Eng-MMustafa/nest-scramble/issues) or start a discussion.

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
