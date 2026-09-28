import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ description: 'Full name of the user', example: 'John Doe', required: true })
  name: string;

  @ApiProperty({ description: 'User role', enum: ['admin', 'user'], example: 'user' })
  role: string;

  @ApiProperty({ type: 'number', format: 'int32', example: 25 })
  age: number;
}
