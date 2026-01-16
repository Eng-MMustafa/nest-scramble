/**
 * Example Controller demonstrating full metadata extraction
 * This controller showcases all the new features:
 * - Request Body schemas with @Body()
 * - Response schemas with proper return types
 * - Status codes (POST=201, GET=200, etc.)
 * - Query and Path parameters
 * - JSDoc descriptions
 */

import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import {
  CreateUserDto,
  UpdateUserDto,
  UserResponseDto,
  PaginationQueryDto,
  PaginatedResponseDto,
} from './example-dto';

@Controller('users')
export class UsersController {
  /**
   * Get all users with pagination
   * @returns Paginated list of users
   */
  @Get()
  findAll(@Query() query: PaginationQueryDto): Promise<PaginatedResponseDto<UserResponseDto>> {
    // Implementation here
    return Promise.resolve({
      data: [],
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 0,
    });
  }

  /**
   * Get a single user by ID
   * @param id User ID
   * @returns User details
   */
  @Get(':id')
  findOne(@Param('id') id: string): Promise<UserResponseDto> {
    // Implementation here
    return Promise.resolve({} as UserResponseDto);
  }

  /**
   * Create a new user
   * @param createUserDto User creation data
   * @returns Created user details
   */
  @Post()
  create(@Body() createUserDto: CreateUserDto): Promise<UserResponseDto> {
    // Implementation here
    return Promise.resolve({} as UserResponseDto);
  }

  /**
   * Update an existing user
   * @param id User ID
   * @param updateUserDto User update data
   * @returns Updated user details
   */
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    // Implementation here
    return Promise.resolve({} as UserResponseDto);
  }

  /**
   * Delete a user
   * @param id User ID
   * @returns Deletion confirmation
   */
  @Delete(':id')
  remove(@Param('id') id: string): Promise<{ message: string }> {
    // Implementation here
    return Promise.resolve({ message: 'User deleted successfully' });
  }
}
