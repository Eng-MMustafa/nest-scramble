/** Test fixture — exercises the decorators the scanner is expected to support. */
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  Query,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { CreateUserDto, ListUsersQueryDto, UserDto } from './dto/user.dto';

class JwtAuthGuard {}

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  /** Returns a paginated list of users */
  @Get()
  listUsers(@Query() query: ListUsersQueryDto): UserDto[] {
    return [];
  }

  @Get(':id')
  getUser(@Param('id') id: string): UserDto {
    return {} as UserDto;
  }

  @Post()
  createUser(@Body() body: CreateUserDto): UserDto {
    return {} as UserDto;
  }

  @Put(':id')
  replaceUser(@Param('id') id: string, @Body() body: CreateUserDto): UserDto {
    return {} as UserDto;
  }

  @Patch(':id')
  updateUser(@Param('id') id: string, @Body() body: CreateUserDto): Promise<UserDto> {
    return Promise.resolve({} as UserDto);
  }

  @Delete(':id')
  @SetMetadata('isPublic', true)
  deleteUser(@Param('id') id: string, @Headers('x-request-id') requestId?: string): void {
    return undefined;
  }

  /** Returns an envelope whose type is inferred, never annotated. */
  @Get('stats/summary')
  getStats() {
    return {
      total: 42,
      active: 40,
      items: [] as UserDto[],
    };
  }
}
