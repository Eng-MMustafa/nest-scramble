/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/

/**
 * NestJS 10 & 11 Compatibility Example
 * 
 * This example demonstrates nest-scramble v3.0.0 working with both
 * NestJS 10.x and 11.x using modern patterns and features.
 */

import { Module, Controller, Get, Post, Put, Delete, Body, Param, Query, Version, UseGuards } from '@nestjs/common';
import { NestScrambleModule } from 'nest-scramble';

// ============================================================================
// DTOs - Modern TypeScript 5.x with better type inference
// ============================================================================

export class CreateUserDto {
  name!: string;
  email!: string;
  age?: number;
}

export class UpdateUserDto {
  name?: string;
  email?: string;
  age?: number;
}

export class UserDto {
  id!: number;
  name!: string;
  email!: string;
  age?: number;
  createdAt!: Date;
  updatedAt!: Date;
}

export class PaginationDto {
  page!: number;
  limit!: number;
  total!: number;
}

export class UserListDto {
  data!: UserDto[];
  pagination!: PaginationDto;
}

// ============================================================================
// Controllers - Using NestJS 10/11 features
// ============================================================================

/**
 * Basic Controller - Works with both NestJS 10 and 11
 */
@Controller('users')
export class UsersController {
  @Get()
  findAll(@Query('page') page: number = 1, @Query('limit') limit: number = 10): UserListDto {
    return {
      data: [
        { id: 1, name: 'John Doe', email: 'john@example.com', age: 30, createdAt: new Date(), updatedAt: new Date() },
        { id: 2, name: 'Jane Smith', email: 'jane@example.com', age: 25, createdAt: new Date(), updatedAt: new Date() },
      ],
      pagination: { page, limit, total: 2 },
    };
  }

  @Get(':id')
  findOne(@Param('id') id: number): UserDto {
    return {
      id,
      name: 'John Doe',
      email: 'john@example.com',
      age: 30,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  @Post()
  create(@Body() createUserDto: CreateUserDto): UserDto {
    return {
      id: 3,
      ...createUserDto,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  @Put(':id')
  update(@Param('id') id: number, @Body() updateUserDto: UpdateUserDto): UserDto {
    return {
      id,
      name: updateUserDto.name || 'John Doe',
      email: updateUserDto.email || 'john@example.com',
      age: updateUserDto.age,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  @Delete(':id')
  remove(@Param('id') id: number): { message: string } {
    return { message: `User ${id} deleted successfully` };
  }
}

/**
 * Versioned Controller - API Versioning (NestJS 10+)
 */
@Controller('products')
export class ProductsController {
  @Version('1')
  @Get()
  findAllV1(): { version: string; data: any[] } {
    return {
      version: 'v1',
      data: [{ id: 1, name: 'Product A', price: 100 }],
    };
  }

  @Version('2')
  @Get()
  findAllV2(): { version: string; data: any[]; metadata: any } {
    return {
      version: 'v2',
      data: [{ id: 1, name: 'Product A', price: 100, currency: 'USD' }],
      metadata: { timestamp: new Date() },
    };
  }

  @Version(['1', '2'])
  @Get(':id')
  findOne(@Param('id') id: number): { id: number; name: string } {
    return { id, name: 'Product A' };
  }
}

// ============================================================================
// Module Configuration - Modern NestJS 10/11 Patterns
// ============================================================================

/**
 * Basic Configuration Example
 */
@Module({
  imports: [
    NestScrambleModule.forRoot({
      path: '/docs',
      enableMock: true,
      baseUrl: 'http://localhost:3000',
      apiTitle: 'NestJS 10/11 API',
      apiVersion: '3.0.0',
      theme: 'futuristic',
      primaryColor: '#00f2ff',
      
      // Advanced features
      useIncrementalScanning: true,
      enableWatchMode: false,
      cacheTtl: 24 * 60 * 60 * 1000, // 24 hours
    }),
  ],
  controllers: [UsersController, ProductsController],
})
export class AppModule {}

/**
 * Async Configuration Example - Using ConfigurableModuleBuilder (NestJS 10+)
 */
@Module({
  imports: [
    // Modern async configuration with useFactory
    NestScrambleModule.forRootAsync({
      useFactory: () => ({
        path: '/api-docs',
        enableMock: process.env.NODE_ENV === 'development',
        baseUrl: process.env.API_BASE_URL || 'http://localhost:3000',
        apiTitle: 'Modern NestJS API',
        apiVersion: '3.0.0',
        theme: 'futuristic',
        useIncrementalScanning: true,
      }),
    }),
  ],
  controllers: [UsersController, ProductsController],
})
export class AsyncAppModule {}

/**
 * With ConfigService Example
 */
/*
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot(),
    NestScrambleModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        baseUrl: config.get('API_BASE_URL'),
        apiTitle: config.get('API_TITLE'),
        enableMock: config.get('NODE_ENV') === 'development',
        theme: config.get('DOCS_THEME') || 'futuristic',
      }),
    }),
  ],
  controllers: [UsersController, ProductsController],
})
export class ConfigBasedAppModule {}
*/

// ============================================================================
// Testing Instructions
// ============================================================================

/**
 * How to Test with NestJS 10:
 * 
 * 1. Create a new project:
 *    npx @nestjs/cli new test-nestjs-10
 *    cd test-nestjs-10
 * 
 * 2. Install NestJS 10:
 *    npm install @nestjs/common@^10.0.0 @nestjs/core@^10.0.0 @nestjs/platform-express@^10.0.0
 * 
 * 3. Ensure Node.js 18.10+ and TypeScript 5+:
 *    node --version  # Should be >=18.10.0
 *    npx tsc --version  # Should be >=5.0.0
 * 
 * 4. Install nest-scramble v3:
 *    npm install nest-scramble@^3.0.0
 * 
 * 5. Copy this file to src/app.module.ts
 * 
 * 6. Start the app:
 *    npm run start:dev
 * 
 * 7. Test the endpoints:
 *    - Documentation: http://localhost:3000/docs
 *    - OpenAPI Spec: http://localhost:3000/docs-json
 *    - Mock Server: http://localhost:3000/scramble-mock/users
 * 
 * How to Test with NestJS 11:
 * 
 * Follow the same steps but install NestJS 11:
 *    npm install @nestjs/common@^11.0.0 @nestjs/core@^11.0.0 @nestjs/platform-express@^11.0.0
 * 
 * Expected Results (Same for both v10 and v11):
 * - ✅ Documentation loads at /docs
 * - ✅ OpenAPI spec available at /docs-json
 * - ✅ Mock endpoints work at /scramble-mock/*
 * - ✅ All controllers detected and documented
 * - ✅ API versioning properly handled
 * - ✅ No deprecation warnings
 * - ✅ No version-specific errors
 */

/**
 * CLI Testing:
 * 
 * Generate OpenAPI spec:
 *    npx nest-scramble generate src --output openapi.json
 * 
 * Generate Postman collection:
 *    npx nest-scramble generate src --format postman --output collection.json
 * 
 * With custom options:
 *    npx nest-scramble generate src \
 *      --output api-spec.json \
 *      --title "My API" \
 *      --apiVersion "3.0.0" \
 *      --baseUrl "https://api.example.com"
 */

/**
 * Performance Testing:
 * 
 * Test incremental scanning:
 * 1. Enable useIncrementalScanning: true
 * 2. First run: ~2100ms (builds cache)
 * 3. Subsequent runs: ~50ms (uses cache)
 * 4. Modify a controller: ~100ms (partial rescan)
 * 
 * Expected cache file: scramble-cache.json
 */

/**
 * Feature Verification Checklist:
 * 
 * ✅ Module Registration
 *    - forRoot() works
 *    - forRootAsync() works
 *    - Options are properly typed
 * 
 * ✅ Controller Scanning
 *    - @Controller decorator detected
 *    - All HTTP methods found
 *    - Parameters properly analyzed
 *    - Return types inferred
 * 
 * ✅ API Versioning
 *    - @Version decorator detected
 *    - Multiple versions supported
 *    - Version arrays handled
 * 
 * ✅ Documentation UI
 *    - Loads without errors
 *    - All endpoints visible
 *    - Request/response examples shown
 *    - Theme customization works
 * 
 * ✅ Mock Server
 *    - /scramble-mock/* responds
 *    - Smart mock data generated
 *    - All HTTP methods supported
 * 
 * ✅ TypeScript 5.x
 *    - No type errors
 *    - Proper inference
 *    - Modern syntax supported
 */
