import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Length, Min } from 'class-validator';

export class CreateProductDto {
  @Type(() => Number) @IsInt() idCategoria: number;
  @IsString() @Length(1, 120) nombre: string;
  @IsOptional() @IsString() descripcion?: string;
  @Type(() => Number) @IsNumber() @Min(0) precio: number;
  @IsOptional() @IsString() fotoUrl?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) stock?: number;
  @IsOptional() @IsBoolean() disponibleHoy?: boolean;
}

export class UpdateProductDto {
  @IsOptional() @Type(() => Number) @IsInt() idCategoria?: number;
  @IsOptional() @IsString() @Length(1, 120) nombre?: string;
  @IsOptional() @IsString() descripcion?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) precio?: number;
  @IsOptional() @IsString() fotoUrl?: string | null;
  @IsOptional() @IsString() fotoUrlAnterior?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) stock?: number;
  @IsOptional() @IsBoolean() disponibleHoy?: boolean;
  @IsOptional() @IsBoolean() activo?: boolean;
}

export class UpdateInventoryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) stock?: number;
  @IsOptional() @IsBoolean() disponibleHoy?: boolean;
}
