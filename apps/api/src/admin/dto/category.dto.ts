import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

export class CreateCategoryDto {
  @IsString() @Length(1, 80) nombre: string;
}

export class UpdateCategoryDto {
  @IsOptional() @IsString() @Length(1, 80) nombre?: string;
  @IsOptional() @IsBoolean() activa?: boolean;
}
