import { Body, Controller, Delete, Get, Param, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { IsInt, IsUUID, Min } from 'class-validator';
import { CartService } from './cart.service';
import { CookieService } from '../common/cookies/cookie.service';

export class AddItemDto {
  @IsUUID() productId: string;
  @IsInt() @Min(1) quantity: number;
}

@Controller('cart')
export class CartController {
  constructor(private cart: CartService, private cookies: CookieService) {}

  @Get()
  async get(@Req() req: Request, @Res() res: Response) {
    const id = await this.cart.getOrCreate(this.cookies.read(req, 'cart_id'));
    this.cookies.setCart(res, id);
    res.json({ cart: await this.cart.getCart(id) });
  }

  @Post('items')
  async add(@Req() req: Request, @Res() res: Response, @Body() dto: AddItemDto) {
    const id = await this.cart.getOrCreate(this.cookies.read(req, 'cart_id'));
    this.cookies.setCart(res, id);
    res.json({ cart: await this.cart.addItem(id, dto.productId, dto.quantity) });
  }

  @Delete('items/:productId')
  async remove(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param('productId') productId: string
  ) {
    const id = await this.cart.getOrCreate(this.cookies.read(req, 'cart_id'));
    this.cookies.setCart(res, id);
    return { cart: await this.cart.removeItem(id, productId) };
  }
}
