import { Body, Controller, Get, Patch, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CookieService } from '../common/cookies/cookie.service';
import { CartService } from '../cart/cart.service';

@Controller('auth')
export class AuthController {
  constructor(
    private auth: AuthService,
    private cart: CartService,
    private cookies: CookieService
  ) {}

  private async attachCart(req: Request, res: Response, userId: string) {
    const token = await this.cart.getOrCreate(this.cookies.read(req, 'cart_id'), userId);
    await this.cart.attachUser(token, userId);
    this.cookies.setCart(res, token);
  }

  @Post('register')
  async register(@Req() req: Request, @Body() dto: RegisterDto, @Res() res: Response) {
    const user = await this.auth.register(dto);
    await this.auth.login({ email: dto.email, password: dto.password }, res);
    await this.attachCart(req, res, user.id);
    res.status(201).json({ user });
  }

  @Post('login')
  async login(@Req() req: Request, @Body() dto: LoginDto, @Res() res: Response) {
    const user = await this.auth.login(dto, res);
    await this.attachCart(req, res, user.id);
    res.json({ user });
  }

  @Post('logout')
  logout(@Res() res: Response) {
    res.json(this.auth.logout(res));
  }

  @Get('me')
  async me(@Req() req: Request, @Res() res: Response) {
    res.json(
      await this.auth.me(this.cookies.read(req, 'sb_access'))
    );
  }

  @Patch('me')
  update(@Req() req: Request, @Body() dto: UpdateProfileDto) {
    return this.auth.updateName(this.cookies.read(req, 'sb_access'), dto);
  }
}
