import { Injectable } from '@nestjs/common';
import { Request, Response } from 'express';
import { env } from '../../config/env';

const base = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production'
};

@Injectable()
export class CookieService {
  setCart(res: Response, token: string) {
    res.cookie('cart_id', token, { ...base, maxAge: env.cartDays * 86400000 });
  }

  clearCart(res: Response) {
    res.clearCookie('cart_id', base);
  }

  setSession(res: Response, token: string, remember: boolean) {
    res.cookie('sb_access', token, remember ? { ...base, maxAge: env.refreshDays * 86400000 } : base);
  }

  clearSession(res: Response) {
    res.clearCookie('sb_access', base);
  }

  read(req: Request, name: 'cart_id' | 'sb_access') {
    return req.cookies?.[name] as string | undefined;
  }
}
