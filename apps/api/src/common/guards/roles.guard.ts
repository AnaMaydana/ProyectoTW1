import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AuthService } from '../../auth/auth.service';
import { CookieService } from '../cookies/cookie.service';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private auth: AuthService,
    private cookies: CookieService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (!required?.length) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const token = this.cookies.read(req, 'sb_access');
    if (!token) throw new UnauthorizedException();

    const user = await this.auth.me(token); // lanza 401 si es inválido o está inactivo
    if (!required.includes(user.role)) throw new ForbiddenException();
    (req as Request & { user?: unknown }).user = user;
    return true;
  }
}
