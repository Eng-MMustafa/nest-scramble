import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { IsEmail, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';
import { IntersectionType, OmitType, PartialType, PickType } from '@nestjs/mapped-types';

export class AuditedDto {
  /** Unique identifier. */
  id: string;

  createdAt: string;
}

export class PersonDto extends AuditedDto {
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @IsEmail()
  email: string;

  @IsOptional()
  nickname?: string;
}

export class UpdatePersonDto extends PartialType(PersonDto) {}

export class PersonCredentialsDto extends PickType(PersonDto, ['email'] as const) {
  @IsNotEmpty()
  password: string;
}

export class PublicPersonDto extends OmitType(PersonDto, ['email'] as const) {}

export class TagsDto {
  tags: string[];
}

export class PersonWithTagsDto extends IntersectionType(PersonDto, TagsDto) {}

interface Timestamped {
  updatedAt: string;
}

export interface PersonView extends Timestamped {
  id: string;
  name: string;
}

@Controller('people')
export class PeopleController {
  @Post()
  create(@Body() dto: PersonDto): PersonView {
    return { id: '1', name: dto.name, updatedAt: new Date().toISOString() };
  }

  @Put()
  update(@Body() dto: UpdatePersonDto): void {
    void dto;
  }

  @Post('login')
  login(@Body() dto: PersonCredentialsDto): void {
    void dto;
  }

  @Get('public')
  getPublic(): PublicPersonDto {
    return new PublicPersonDto();
  }

  @Post('tags')
  withTags(@Body() dto: PersonWithTagsDto): void {
    void dto;
  }
}
