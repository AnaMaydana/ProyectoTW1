import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';

export type PaymentMethod = 'EFECTIVO' | 'QR' | 'TRANSFERENCIA';

export class CreateOrderDto {
  @Matches(/^(?:0[6-9]:[0-5]\d|10:[0-5]\d|11:00)$/, {
    message: 'La hora debe estar entre 06:00 y 11:00'
  })
  pickupTime: string;

  @IsOptional() @IsString() notes?: string;

  @IsEnum(['EFECTIVO', 'QR', 'TRANSFERENCIA']) paymentMethod: PaymentMethod;

  @IsOptional() @IsString() customerName?: string;

  @IsOptional() @IsString() customerPhone?: string;
}
