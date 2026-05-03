/**
 * UI Configuration Example
 *
 * Demonstrates NestScrambleModule setup options for the built-in
 * documentation interface.
 */

import { Module } from '@nestjs/common';
import { NestScrambleModule } from 'nest-scramble';

// ─── Example 1: Minimal setup ────────────────────────────────────────────────
@Module({
  imports: [
    NestScrambleModule.forRoot({
      path: '/api-docs',
      enableMock: true,
    }),
  ],
})
export class AppModule {}

// ─── Example 2: Full configuration ───────────────────────────────────────────
@Module({
  imports: [
    NestScrambleModule.forRoot({
      path: '/api-docs',
      apiTitle: 'My API',
      apiVersion: '1.0.0',
      enableMock: true,
      autoExportPostman: true,
      postmanOutputPath: './postman-collection.json',
    }),
  ],
})
export class AppFullModule {}

// ─── Example 3: Async configuration (e.g. reading from ConfigService) ────────
@Module({
  imports: [
    NestScrambleModule.forRootAsync({
      useFactory: () => ({
        path: '/docs',
        apiTitle: 'My API',
        enableMock: process.env.NODE_ENV !== 'production',
      }),
    }),
  ],
})
export class AppAsyncModule {}
