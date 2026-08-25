/** Test fixture — a realistic DTO set used by the e2e and scanner tests. */

export enum UserRole {
  Admin = 'admin',
  Member = 'member',
}

export class AddressDto {
  /** Street including house number */
  street!: string;
  city!: string;
  zip?: string;
}

export class UserDto {
  id!: number;
  /** Primary contact email */
  email!: string;
  fullName!: string;
  role!: UserRole;
  address?: AddressDto;
  tags!: string[];
  isActive!: boolean;
}

export class CreateUserDto {
  email!: string;
  fullName!: string;
  role?: UserRole;
}

export class ListUsersQueryDto {
  page?: number;
  limit?: number;
  search?: string;
}
