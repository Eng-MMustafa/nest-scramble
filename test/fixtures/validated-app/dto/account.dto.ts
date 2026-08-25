/**
 * Test fixture exercising `class-validator` constraint extraction.
 *
 * The decorators are declared locally so the fixture does not require
 * class-validator to be installed — the scanner reads decorator names from the
 * AST and never evaluates them.
 */

const decorator = () => (_target: object, _key: string) => undefined;

export const IsEmail = decorator;
export const IsUUID = decorator;
export const IsUrl = decorator;
export const IsDateString = decorator;
export const IsInt = decorator;
export const IsPositive = decorator;
export const IsNegative = decorator;
export const IsOptional = decorator;
export const IsNotEmpty = decorator;
export const ArrayUnique = decorator;
export const MinLength = (_n: number) => decorator();
export const MaxLength = (_n: number) => decorator();
export const Length = (_min: number, _max: number) => decorator();
export const Min = (_n: number) => decorator();
export const Max = (_n: number) => decorator();
export const Matches = (_re: RegExp) => decorator();
export const IsIn = (_values: unknown[]) => decorator();
export const ArrayMinSize = (_n: number) => decorator();
export const ArrayMaxSize = (_n: number) => decorator();
export const IsDivisibleBy = (_n: number) => decorator();

export class CreateAccountDto {
  /** Contact address used for sign-in */
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @Length(2, 40)
  displayName!: string;

  @IsInt()
  @Min(18)
  @Max(120)
  age!: number;

  @IsPositive()
  creditBalance!: number;

  @IsNegative()
  debtBalance!: number;

  @Matches(/^[a-z0-9_]+$/)
  handle!: string;

  @IsIn(['free', 'pro', 'enterprise'])
  plan!: string;

  @IsUUID()
  tenantId!: string;

  @IsUrl()
  website?: string;

  @IsDateString()
  bornOn!: string;

  @IsDivisibleBy(5)
  quantity!: number;

  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ArrayUnique()
  tags!: string[];

  /** Optional despite having no question mark, because of @IsOptional */
  @IsOptional()
  nickname!: string;

  /** Required despite the question mark, because of @IsNotEmpty */
  @IsNotEmpty()
  slug?: string;

  plainField!: string;
}
