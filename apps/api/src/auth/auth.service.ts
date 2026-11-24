import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Response } from 'express';
import { SupabaseService } from '../supabase/supabase.service';
import { CookieService } from '../common/cookies/cookie.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class AuthService {
  constructor(private sb: SupabaseService, private cookies: CookieService) {}

  async register(dto: RegisterDto) {
    const { data, error } = await this.sb.anon.auth.signUp({
      email: dto.email,
      password: dto.password
    });
    if (error || !data.user) throw new Error(error?.message ?? 'REGISTER_FAILED');

    const { data: profile, error: profileError } = await this.sb.admin
      .from('profiles')
      .insert({ id: data.user.id, name: dto.name, phone: dto.phone, role: 'CLIENTE' })
      .select()
      .single();
    if (profileError) throw new Error(profileError.message);

    return this.toUser(data.user.id, data.user.email!, profile);
  }

  async login(dto: LoginDto, res: Response) {
    const { data, error } = await this.sb.anon.auth.signInWithPassword({
      email: dto.email,
      password: dto.password
    });
    if (error || !data.session || !data.user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    this.cookies.setSession(
      res,
      data.session.access_token,
      data.session.refresh_token,
      dto.remember ?? false
    );
    return this.hydrate(data.user.id, data.user.email!);
  }

  logout(res: Response) {
    this.cookies.clearSession(res);
    return { ok: true };
  }

  async me(access?: string, refresh?: string, res?: Response) {
    let token = access;
    if (!token && refresh && res) {
      const { data, error } = await this.sb.anon.auth.refreshSession({
        refresh_token: refresh
      });
      if (error || !data.session) throw new UnauthorizedException();
      token = data.session.access_token;
      this.cookies.setSession(res, token, data.session.refresh_token, true);
    }
    if (!token) throw new UnauthorizedException();

    const { data, error } = await this.sb.anon.auth.getUser(token);
    if (error || !data.user) throw new UnauthorizedException();
    return this.hydrate(data.user.id, data.user.email!);
  }

  async updateName(access: string | undefined, dto: UpdateProfileDto) {
    const user = await this.me(access);
    const { data, error } = await this.sb.admin
      .from('profiles')
      .update({ name: dto.name })
      .eq('id', user.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { ...user, name: data.name };
  }

  private async hydrate(id: string, email: string) {
    const { data } = await this.sb.admin
      .from('profiles')
      .select('name,phone,role')
      .eq('id', id)
      .single();
    return this.toUser(id, email, data);
  }

  private toUser(id: string, email: string, profile: any) {
    return {
      id,
      email,
      name: profile?.name ?? '',
      phone: profile?.phone ?? '',
      role: profile?.role ?? 'CLIENTE'
    };
  }
}
