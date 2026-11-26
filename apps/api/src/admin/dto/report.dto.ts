import { Type } from 'class-transformer';
import {
  IsInt, IsOptional, Max, Min, registerDecorator, ValidationOptions,
  ValidatorConstraint, ValidatorConstraintInterface
} from 'class-validator';

@ValidatorConstraint({ name: 'realDate', async: false })
class RealDateConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
  }
}

export function IsRealDate(options?: ValidationOptions) {
  return (object: Object, propertyName: string) => {
    registerDecorator({
      target: object.constructor as Function, propertyName, options,
      validator: RealDateConstraint
    });
  };
}

export class ReportRangeDto {
  @IsOptional() @IsRealDate() from?: string;
  @IsOptional() @IsRealDate() to?: string;
}

export class TopProductsDto extends ReportRangeDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
}

export class LowStockDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) threshold?: number;
}
