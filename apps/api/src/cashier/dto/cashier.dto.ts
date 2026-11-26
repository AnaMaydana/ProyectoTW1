import { IsIn, IsOptional, Matches } from 'class-validator';
import { IsRealDate } from '../../admin/dto/report.dto';

export const ORDER_STATUSES = [
  'PENDIENTE', 'CONFIRMADO', 'PREPARANDO', 'LISTO', 'ENTREGADO', 'CANCELADO'
] as const;

export const PATCHABLE_STATUSES = [
  'CONFIRMADO', 'PREPARANDO', 'LISTO', 'CANCELADO'
] as const;

export class UpdateOrderStatusDto {
  @IsIn([...PATCHABLE_STATUSES], { message: 'Estado no permitido' })
  status: string;
}

export class DeliverOrderDto {
  @Matches(/^SAL-\d{8}-\d{4}$/, { message: 'El código debe tener el formato SAL-AAAAMMDD-####' })
  code: string;
}

export class CashierOrdersQueryDto {
  @IsOptional()
  @IsIn([...ORDER_STATUSES], { message: 'Estado inválido' })
  status?: string;

  @IsOptional()
  @IsRealDate({ message: 'La fecha debe ser AAAA-MM-DD válida' })
  date?: string;
}
