import {
  ConflictException,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { Response } from 'express';
import { DatabaseService } from '../database/database.service';
import { env } from '../config/env';
import { CookieService } from '../common/cookies/cookie.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

interface UserRow {
  id_usuario: number;
  correo: string;
  nombre: string;
  celular: string | null;
  role: string;
}

@Injectable()
export class AuthService {
  constructor(private db: DatabaseService, private cookies: CookieService) {}

  async register(dto: RegisterDto) {
    const existing = await this.db.query('SELECT 1 FROM usuario WHERE lower(correo) = lower($1)', [
      dto.email
    ]);
    if (existing.rowCount) throw new ConflictException('Ese correo ya está registrado');

    const role = await this.db.query<{ id_rol: number }>(
      'SELECT id_rol FROM rol WHERE nombre = $1',
      ['CLIENTE']
    );
    if (!role.rowCount) throw new Error('ROL_CLIENTE_MISSING');

    const hash = await bcrypt.hash(dto.password, 10);
    const inserted = await this.db.query<{ id_usuario: number }>(
      `INSERT INTO usuario (id_rol, nombre, celular, correo, password_hash, activo)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       RETURNING id_usuario`,
      [role.rows[0].id_rol, dto.name, dto.phone, dto.email, hash]
    );
    return this.hydrate(inserted.rows[0].id_usuario);
  }

  async login(dto: LoginDto, res: Response) {
    const result = await this.db.query<UserRow & { password_hash: string }>(
      `SELECT u.id_usuario, u.correo, u.nombre, u.celular, r.nombre AS role, u.password_hash
       FROM usuario u JOIN rol r ON r.id_rol = u.id_rol
       WHERE lower(u.correo) = lower($1) AND u.activo = TRUE`,
      [dto.email]
    );
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(dto.password, user.password_hash))) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const expiresIn = (dto.remember ? `${env.refreshDays}d` : '1d') as jwt.SignOptions['expiresIn'];
    const token = jwt.sign({ sub: String(user.id_usuario), email: user.correo }, env.jwtSecret, {
      expiresIn
    });
    this.cookies.setSession(res, token, dto.remember ?? false);
    return this.toUser(user);
  }

  logout(res: Response) {
    this.cookies.clearSession(res);
    return { ok: true };
  }

  async me(access?: string) {
    if (!access) throw new UnauthorizedException('Inicie sesión para continuar');
    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(access, env.jwtSecret) as jwt.JwtPayload;
    } catch {
      throw new UnauthorizedException('Sesión inválida o vencida');
    }
    if (!payload.sub) throw new UnauthorizedException('Sesión inválida o vencida');
    return this.hydrate(Number(payload.sub));
  }

  async updateName(access: string | undefined, dto: UpdateProfileDto) {
    const user = await this.me(access);
    await this.db.query('UPDATE usuario SET nombre = $1 WHERE id_usuario = $2', [
      dto.name,
      Number(user.id)
    ]);
    return { ...user, name: dto.name };
  }

  private async hydrate(id: number) {
    const result = await this.db.query<UserRow>(
      `SELECT u.id_usuario, u.correo, u.nombre, u.celular, r.nombre AS role
       FROM usuario u JOIN rol r ON r.id_rol = u.id_rol
       WHERE u.id_usuario = $1 AND u.activo = TRUE`,
      [id]
    );
    if (!result.rowCount) throw new UnauthorizedException('Sesión inválida o vencida');
    return this.toUser(result.rows[0]);
  }

  private toUser(row: UserRow) {
    return {
      id: String(row.id_usuario),
      email: row.correo,
      name: row.nombre,
      phone: row.celular ?? '',
      role: row.role
    };
  }
}
