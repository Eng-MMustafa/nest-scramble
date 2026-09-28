import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CreateUserDto } from './CreateUserDto';

@ApiTags('User Management', 'Administration')
@Controller('users')
export class UsersController {
  @ApiOperation({ summary: 'List all users', description: 'Returns a paginated list of users.' })
  @Get()
  list(): string[] {
    return [];
  }

  @Post()
  create(@Body() dto: CreateUserDto): CreateUserDto {
    return dto;
  }
}
