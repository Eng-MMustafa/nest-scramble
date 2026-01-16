/**
 * Example DTOs demonstrating full metadata extraction
 * These DTOs showcase JSDoc comments, required fields, and nested structures
 */

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  GUEST = 'guest',
}

export class CreateUserDto {
  /**
   * User's full name
   */
  name: string;

  /**
   * User's email address (must be unique)
   */
  email: string;

  /**
   * User's password (min 8 characters)
   */
  password: string;

  /**
   * User's role in the system
   */
  role: UserRole;

  /**
   * User's age (optional)
   */
  age?: number;

  /**
   * User's phone number (optional)
   */
  phone?: string;
}

export class UpdateUserDto {
  /**
   * User's full name (optional for updates)
   */
  name?: string;

  /**
   * User's email address (optional for updates)
   */
  email?: string;

  /**
   * User's role in the system (optional for updates)
   */
  role?: UserRole;

  /**
   * User's age (optional)
   */
  age?: number;
}

export class AddressDto {
  /**
   * Street address
   */
  street: string;

  /**
   * City name
   */
  city: string;

  /**
   * Country name
   */
  country: string;

  /**
   * Postal/ZIP code (optional)
   */
  zipCode?: string;
}

export class UserResponseDto {
  /**
   * Unique user identifier
   */
  id: number;

  /**
   * User's full name
   */
  name: string;

  /**
   * User's email address
   */
  email: string;

  /**
   * User's role in the system
   */
  role: UserRole;

  /**
   * User's age
   */
  age?: number;

  /**
   * User's phone number
   */
  phone?: string;

  /**
   * User's address information
   */
  address?: AddressDto;

  /**
   * Timestamp when the user was created
   */
  createdAt: Date;

  /**
   * Timestamp when the user was last updated
   */
  updatedAt: Date;
}

export class PaginationQueryDto {
  /**
   * Page number (starts from 1)
   */
  page?: number;

  /**
   * Number of items per page
   */
  limit?: number;

  /**
   * Sort field name
   */
  sortBy?: string;

  /**
   * Sort order (asc or desc)
   */
  order?: 'asc' | 'desc';
}

export class PaginatedResponseDto<T> {
  /**
   * Array of items for the current page
   */
  data: T[];

  /**
   * Total number of items across all pages
   */
  total: number;

  /**
   * Current page number
   */
  page: number;

  /**
   * Number of items per page
   */
  limit: number;

  /**
   * Total number of pages
   */
  totalPages: number;
}
