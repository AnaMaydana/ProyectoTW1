import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class ReportRangeDto {
  @IsOptional() @Matches(DATE) from?: string;
  @IsOptional() @Matches(DATE) to?: string;
}

export class TopProductsDto extends ReportRangeDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
}

export class LowStockDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) threshold?: number;
}
