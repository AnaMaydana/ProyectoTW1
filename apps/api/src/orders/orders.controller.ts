import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException
} from '@nestjs/common';
import { Request, Response } from 'express';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { AuthService } from '../auth/auth.service';
import { CartService } from '../cart/cart.service';
import { CookieService } from '../common/cookies/cookie.service';

@Controller('orders')
export class OrdersController {
  constructor(
    private orders: OrdersService,
    private auth: AuthService,
    private cart: CartService,
    private cookies: CookieService
  ) {}

  private async context(req: Request, res: Response) {
    const cartId = await this.cart.getOrCreate(this.cookies.read(req, 'cart_id'));
    const access = this.cookies.read(req, 'sb_access');
    const refresh = this.cookies.read(req, 'sb_refresh');
    let user: any = null;
    try {
      user = await this.auth.me(access, refresh, res);
    } catch {
      user = null;
    }
    if (user) await this.cart.attachUser(cartId, user.id);
    return { cartId, user };
  }

  @Post()
  async create(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: CreateOrderDto
  ) {
    const { cartId, user } = await this.context(req, res);
    return {
      order: await this.orders.create(
        user?.id ?? null,
        cartId,
        dto,
        {
          name: user?.name || dto.customerName || '',
          phone: user?.phone || dto.customerPhone || ''
        }
      )
    };
  }

  @Get()
  async list(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { user } = await this.context(req, res);
    if (!user) return { orders: [] };
    return { orders: await this.orders.list(user.id) };
  }

  @Post(':id/repeat')
  async repeat(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param('id') id: string
  ) {
    const { cartId, user } = await this.context(req, res);
    if (!user) throw new UnauthorizedException('Ingresá para repetir un pedido');
    return this.orders.repeat(user.id, cartId, id);
  }

  @Post(':id/cancel')
  async cancel(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param('id') id: string
  ) {
    const { user } = await this.context(req, res);
    if (!user) throw new UnauthorizedException('Ingresá para cancelar un pedido');
    return { order: await this.orders.cancel(user.id, id) };
  }
}
