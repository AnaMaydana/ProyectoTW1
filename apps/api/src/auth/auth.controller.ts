import { Body, Controller, Get, Patch, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CookieService } from '../common/cookies/cookie.service';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService, private cookies: CookieService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto, @Res() res: Response) {
    const user = await this.auth.register(dto);
    await this.auth.login({ email: dto.email, password: dto.password }, res);
    res.status(201).json({ user });
  }

  @Post('login')
  async login(@Body() dto: LoginDto, @Res() res: Response) {
    res.json({ user: await this.auth.login(dto, res) });
  }

  @Post('logout')
  logout(@Res() res: Response) {
    res.json(this.auth.logout(res));
  }

  @Get('me')
  async me(@Req() req: Request, @Res() res: Response) {
    res.json(
      await this.auth.me(
        this.cookies.read(req, 'sb_access'),
        this.cookies.read(req, 'sb_refresh'),
        res
      )
    );
  }

  @Patch('me')
  update(@Req() req: Request, @Body() dto: UpdateProfileDto) {
    return this.auth.updateName(this.cookies.read(req, 'sb_access'), dto);
  }
}
