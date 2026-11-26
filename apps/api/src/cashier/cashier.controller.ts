import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseFilters, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../common/guards/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CashierExceptionFilter } from './cashier-exception.filter';
import { CashierService } from './cashier.service';
import { CashierOrdersQueryDto, DeliverOrderDto, UpdateOrderStatusDto } from './dto/cashier.dto';

@Controller('cashier')
@UseGuards(RolesGuard)
@UseFilters(CashierExceptionFilter)
@Roles('CAJERO', 'ADMIN')
export class CashierController {
  constructor(private cashier: CashierService) {}

  private userId(req: Request): string {
    return (req as Request & { user?: { id?: string } }).user?.id ?? 'desconocido';
  }

  @Get('orders')
  async orders(@Query() query: CashierOrdersQueryDto) {
    return { orders: await this.cashier.list(query.status, query.date) };
  }

  @Get('orders/code/:code')
  async byCode(@Param('code') code: string) {
    return { order: await this.cashier.byCode(code) };
  }

  @Patch('orders/:id/status')
  async status(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return { order: await this.cashier.changeStatus(id, dto.status, this.userId(req)) };
  }

  @Post('orders/:id/deliver')
  async deliver(@Req() req: Request, @Param('id') id: string, @Body() dto: DeliverOrderDto) {
    return this.cashier.deliver(id, dto.code, this.userId(req));
  }
}
