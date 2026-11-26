import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AllowedPhotoContentType } from './dto/photo.dto';
import { supabaseServiceRoleKey, supabaseUrl } from '../config/env';

const MAX_BYTES = 5 * 1024 * 1024;
const EXTENSION: Record<AllowedPhotoContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};
const MAGIC: Record<AllowedPhotoContentType, Buffer> = {
  'image/jpeg': Buffer.from([0xff, 0xd8, 0xff]),
  'image/png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/webp': Buffer.from([0x52, 0x49, 0x46, 0x46])
};

@Injectable()
export class PhotoStorageService {
  private baseUrl(): string {
    return supabaseUrl();
  }

  publicUrlPrefix(): string {
    return `${this.baseUrl()}/storage/v1/object/public/portadas/productos/`;
  }

  isManagedUrl(publicUrl: string): boolean {
    const base = process.env.SUPABASE_URL?.replace(/\/$/, '');
    return Boolean(base && publicUrl.startsWith(`${base}/storage/v1/object/public/portadas/productos/`));
  }

  private headers(): Record<string, string> {
    const key = supabaseServiceRoleKey();
    return {
      Authorization: `Bearer ${key}`,
      apikey: key,
      'x-upsert': 'false'
    };
  }

  private validate(buffer: Buffer, contentType: AllowedPhotoContentType): void {
    if (!(contentType in EXTENSION)) {
      throw new BadRequestException('Formato de imagen no permitido (usa JPG, PNG o WebP)');
    }
    if (buffer.length === 0 || buffer.length > MAX_BYTES) {
      throw new BadRequestException('La foto debe pesar 5 MB o menos');
    }
    const magic = MAGIC[contentType];
    if (!buffer.subarray(0, magic.length).equals(magic)) {
      throw new BadRequestException('El archivo de imagen no es válido');
    }
    if (contentType === 'image/webp' && buffer.subarray(8, 12).toString('ascii') !== 'WEBP') {
      throw new BadRequestException('El archivo de imagen no es válido');
    }
  }

  async upload(base64: string, contentType: AllowedPhotoContentType): Promise<string> {
    let buffer: Buffer;
    let headers: Record<string, string>;
    try {
      buffer = Buffer.from(base64, 'base64');
      headers = this.headers();
    } catch {
      throw new ServiceUnavailableException('No se pudo subir la foto');
    }
    this.validate(buffer, contentType);

    const filename = `${randomUUID()}.${EXTENSION[contentType]}`;
    const path = `productos/${filename}`;
    const target = `${this.baseUrl()}/storage/v1/object/portadas/${path}`;
    let res: Response;
    try {
      res = await fetch(target, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': contentType },
        body: new Uint8Array(buffer)
      });
    } catch {
      throw new ServiceUnavailableException('No se pudo subir la foto');
    }
    if (!res.ok) throw new ServiceUnavailableException('No se pudo subir la foto');
    return `${this.publicUrlPrefix()}${filename}`;
  }

  async remove(publicUrl: string): Promise<void> {
    if (!this.isManagedUrl(publicUrl)) {
      throw new BadRequestException('URL de foto no permitida');
    }
    const filename = publicUrl.slice(this.publicUrlPrefix().length);
    const target = `${this.baseUrl()}/storage/v1/object/portadas/productos/${filename}`;
    try {
      const res = await fetch(target, { method: 'DELETE', headers: this.headers() });
      if (!res.ok) throw new Error(`Storage respondió ${res.status}`);
    } catch {
      throw new ServiceUnavailableException('No se pudo borrar la foto');
    }
  }
}
