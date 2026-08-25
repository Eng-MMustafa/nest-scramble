/**
 * Test fixture for decorators that v3.0.6 either dropped silently or guessed at:
 * object-form `@Controller`, `@All`/`@Options`/`@Head`, `@HttpCode`, and method
 * JSDoc as the operation summary.
 */
import {
  All,
  Body,
  Controller,
  Delete,
  Get,
  Head,
  HttpCode,
  HttpStatus,
  Options,
  Param,
  Post,
} from '@nestjs/common';
import { CreateAccountDto } from './dto/account.dto';

@Controller({ path: 'accounts', version: '2' })
export class AccountsController {
  /**
   * List every account
   *
   * Supports cursor pagination and returns the full account projection.
   */
  @Get()
  listAccounts(): CreateAccountDto[] {
    return [];
  }

  /** Create a new account */
  @Post()
  @HttpCode(202)
  createAccount(@Body() body: CreateAccountDto): CreateAccountDto {
    return body;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeAccount(@Param('id') id: string): void {
    return undefined;
  }

  /**
   * Legacy account lookup
   * @deprecated Use listAccounts instead
   */
  @Get('legacy/:id')
  legacyLookup(@Param('id') id: string): CreateAccountDto {
    return {} as CreateAccountDto;
  }

  @Options('preflight')
  preflight(): void {
    return undefined;
  }

  @Head('exists/:id')
  exists(@Param('id') id: string): void {
    return undefined;
  }

  @All('webhook')
  webhook(@Body() body: CreateAccountDto): void {
    return undefined;
  }
}

@Controller()
export class RootController {
  @Get('health')
  health(): string {
    return 'ok';
  }
}
