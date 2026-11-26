# Subida de fotos de productos por el admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que el admin suba, reemplace y quita fotos de productos desde el formulario, guardarlas en Supabase Storage y mostrarlas en `/menu`.

**Architecture:** La web lee el archivo y envía base64 a un endpoint ADMIN de la API; la API valida tipo real y tamaño, guarda el objeto en el bucket público `portadas` con nombre UUID y devuelve la URL pública que ya consume `producto.foto_url`. El reemplazo/quitado borra la foto anterior después de actualizar la BD, con `fotoUrlAnterior` como señal.

**Tech Stack:** NestJS 10 + TypeScript + class-validator (API), React 19 + Next.js 15 + Jest/Testing Library (web), Supabase Storage REST con `fetch` nativo, Postgres existente. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-11-26-admin-photo-upload-design.md`

## Global Constraints

- Formatos permitidos: exactamente `image/jpeg`, `image/png`, `image/webp`.
- Tamaño máximo: **5 MB** (`5 * 1024 * 1024` bytes), validado en servidor.
- Bucket: `portadas`, público. Objetos: `productos/<uuid>.<ext>`.
- Nombre final generado con `crypto.randomUUID()`; nunca usar el nombre del archivo del usuario.
- Clave `SUPABASE_SERVICE_ROLE_KEY` solo en la API/Render; **nunca** variable `NEXT_PUBLIC_*`, nunca en logs ni en el repo.
- `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` se toman del `.env` local para Render, sin imprimir valores.
- Mensajes de error en español: `Formato de imagen no permitido (usa JPG, PNG o WebP)`, `La foto debe pesar 5 MB o menos`, `El archivo de imagen no es válido`, `No se pudo subir la foto`.
- Sin cambios de esquema, migraciones, cookies, textos, precios en Bs ni reglas de negocio.
- Sin push, PR ni merge sin aprobación explícita. PR #2 queda abierto y sin merge.
- No imprimir tokens (en especial el token de Vercel); cargarlos desde archivo.
- Responsive auditable en 360×800, 768×1024 y 1366×768; targets ≥ 44 px (ya garantizado por `button, input, select, textarea { min-height: 44px }`).
- Commits frecuentes y locales; cada task termina con su propio commit.

## Review Focus

- **Variable de Storage ausente en Render:** la API debe seguir arrancando y responder `503 No se pudo subir la foto` al usar fotos → test en Task 2 (`env sin SUPABASE_URL` y `fetch !ok`).
- **Archivo renombrado con MIME válido:** no puede aceptarse si los magic bytes no coinciden → test en Task 2 (`magic bytes incorrectos`, incluido WebP `RIFF....WEBP`).
- **Límite exacto de 5 MB:** 5 MB pasa, 5 MB + 1 se rechaza → test en Task 2 (`tamaño límite`).
- **PATCH sin `fotoUrl`:** no debe borrar la foto existente; el `COALESCE` actual lo evita pero el nuevo `CASE` debe conservar esa semántica → test en Task 4 (`fotoUrl ausente`).
- **Fallo al guardar después de subir:** no debe quedar archivo huérfano; la web llama a `DELETE /admin/products/photo` con la URL recién subida → test en Task 5 (`limpieza si falla el guardado`).

---

### Task 1: Configuración de Storage y DTO de subida

**Files:**
- Modify: `apps/api/src/config/env.ts`
- Test: `apps/api/src/config/env.spec.ts`
- Create: `apps/api/src/admin/dto/photo.dto.ts`
- Test: `apps/api/src/admin/dto/photo.dto.spec.ts`

**Interfaces:**
- Consumes: `process.env.SUPABASE_URL`, `process.env.SUPABASE_SERVICE_ROLE_KEY`.
- Produces: `supabaseUrl(): string` y `supabaseServiceRoleKey(): string` (lanzan `Error('Falta ...')` si no están; quitan la barra final de la URL); `AllowedPhotoContentType`, `UploadPhotoDto`, `DeletePhotoDto`.

- [ ] **Step 1: Escribir el test que falla para la configuración**

Agregar a `apps/api/src/config/env.spec.ts`:

```ts
import { apiPort, loadEnv, supabaseServiceRoleKey, supabaseUrl } from './env';

// ...dentro del describe existente, antes del cierre final:

describe('configuración de Supabase Storage', () => {
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  });

  it('devuelve la URL sin barra final', () => {
    process.env.SUPABASE_URL = 'https://demo.supabase.co/';
    expect(supabaseUrl()).toBe('https://demo.supabase.co');
  });

  it('falla en español si falta SUPABASE_URL', () => {
    delete process.env.SUPABASE_URL;
    expect(() => supabaseUrl()).toThrow('Falta SUPABASE_URL');
  });

  it('falla en español si falta SUPABASE_SERVICE_ROLE_KEY', () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => supabaseServiceRoleKey()).toThrow('Falta SUPABASE_SERVICE_ROLE_KEY');
  });
});
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

Run: `npm -w apps/api test -- --runInBand src/config/env.spec.ts`
Expected: FAIL con `supabaseUrl is not a function`.

- [ ] **Step 3: Implementar las funciones de configuración**

Agregar al final de `apps/api/src/config/env.ts`:

```ts
/** Se leen al usar Storage, no al importar el módulo, para no romper tests sin Storage. */
export function supabaseUrl(): string {
  const value = process.env.SUPABASE_URL;
  if (!value) throw new Error('Falta SUPABASE_URL');
  return value.replace(/\/$/, '');
}

export function supabaseServiceRoleKey(): string {
  const value = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY');
  return value;
}
```

- [ ] **Step 4: Ejecutar y confirmar que pasa**

Run: `npm -w apps/api test -- --runInBand src/config/env.spec.ts`
Expected: PASS (todos los tests de `env.spec.ts`).

- [ ] **Step 5: Escribir el test que falla para el DTO**

Crear `apps/api/src/admin/dto/photo.dto.spec.ts`:

```ts
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UploadPhotoDto } from './photo.dto';

const base = { fileName: 'foto.png', contentType: 'image/png', base64: 'aW1n' };

describe('UploadPhotoDto', () => {
  it('acepta JPG, PNG y WebP', async () => {
    for (const contentType of ['image/jpeg', 'image/png', 'image/webp']) {
      const errors = await validate(plainToInstance(UploadPhotoDto, { ...base, contentType }));
      expect(errors).toHaveLength(0);
    }
  });

  it('rechaza otro formato con mensaje en español', async () => {
    const errors = await validate(plainToInstance(UploadPhotoDto, { ...base, contentType: 'image/gif' }));
    expect(errors[0].constraints?.isIn).toBe('Formato de imagen no permitido (usa JPG, PNG o WebP)');
  });

  it('rechaza base64 con caracteres raros', async () => {
    const errors = await validate(plainToInstance(UploadPhotoDto, { ...base, base64: '!!!' }));
    expect(errors[0].constraints?.matches).toBe('El archivo de imagen no es válido');
  });

  it('rechaza nombre de archivo vacío', async () => {
    const errors = await validate(plainToInstance(UploadPhotoDto, { ...base, fileName: '' }));
    expect(errors[0].constraints?.minLength).toBeDefined();
  });
});
```

- [ ] **Step 6: Ejecutar y confirmar que falla**

Run: `npm -w apps/api test -- --runInBand src/admin/dto/photo.dto.spec.ts`
Expected: FAIL con `Cannot find module './photo.dto'`.

- [ ] **Step 7: Implementar el DTO**

Crear `apps/api/src/admin/dto/photo.dto.ts`:

```ts
import { IsIn, IsString, Length, Matches } from 'class-validator';

export type AllowedPhotoContentType = 'image/jpeg' | 'image/png' | 'image/webp';

const ALLOWED: AllowedPhotoContentType[] = ['image/jpeg', 'image/png', 'image/webp'];

export class UploadPhotoDto {
  @IsString() @Length(1, 255)
  fileName: string;

  @IsIn(ALLOWED, { message: 'Formato de imagen no permitido (usa JPG, PNG o WebP)' })
  contentType: AllowedPhotoContentType;

  @Matches(/^[A-Za-z0-9+/]+={0,2}$/, { message: 'El archivo de imagen no es válido' })
  base64: string;
}

export class DeletePhotoDto {
  @IsString() @Length(1, 500)
  url: string;
}
```

- [ ] **Step 8: Ejecutar y confirmar que pasa**

Run: `npm -w apps/api test -- --runInBand src/admin/dto/photo.dto.spec.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/config/env.ts apps/api/src/config/env.spec.ts apps/api/src/admin/dto/photo.dto.ts apps/api/src/admin/dto/photo.dto.spec.ts
git commit -m "feat(api): config y DTO para subida de fotos"
```

---

### Task 2: Servicio de Supabase Storage

**Files:**
- Create: `apps/api/src/admin/photo-storage.service.ts`
- Test: `apps/api/src/admin/photo-storage.service.spec.ts`
- Modify: `apps/api/src/admin/admin.module.ts`

**Interfaces:**
- Consumes: `supabaseUrl()`, `supabaseServiceRoleKey()`, `AllowedPhotoContentType` (Task 1).
- Produces: `PhotoStorageService` con `upload(base64: string, contentType: AllowedPhotoContentType): Promise<string>`, `remove(publicUrl: string): Promise<void>`, `isManagedUrl(publicUrl: string): boolean`.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `apps/api/src/admin/photo-storage.service.spec.ts`:

```ts
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { PhotoStorageService } from './photo-storage.service';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const BASE_URL = 'https://demo.supabase.co';
const PREFIX = `${BASE_URL}/storage/v1/object/public/portadas/productos/`;
const originalFetch = global.fetch;
const originalUrl = process.env.SUPABASE_URL;
const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const service = () => new PhotoStorageService();

describe('PhotoStorageService', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = BASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-prueba';
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 201 });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    jest.restoreAllMocks();
  });

  it('sube un PNG y devuelve su URL pública', async () => {
    const url = await service().upload(PNG.toString('base64'), 'image/png');
    expect(url).toMatch(new RegExp(`^${PREFIX}[0-9a-f-]{36}\\.png$`));
    const [target, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(target).toBe(`${BASE_URL}/storage/v1/object/portadas/productos/` + url.split('/').pop());
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer clave-de-prueba',
      apikey: 'clave-de-prueba',
      'Content-Type': 'image/png',
      'x-upsert': 'false'
    });
    expect(Buffer.from(init.body)).toEqual(PNG);
  });

  it('acepta exactamente 5 MB', async () => {
    const body = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024 - PNG.length, 0)]);
    await expect(service().upload(body.toString('base64'), 'image/png')).resolves.toMatch(/^https:/);
  });

  it('rechaza 5 MB + 1', async () => {
    const body = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024 - PNG.length + 1, 0)]);
    await expect(service().upload(body.toString('base64'), 'image/png')).rejects.toThrow(
      new BadRequestException('La foto debe pesar 5 MB o menos')
    );
  });

  it('rechaza magic bytes incorrectos', async () => {
    const body = Buffer.from('no-es-una-imagen');
    await expect(service().upload(body.toString('base64'), 'image/png')).rejects.toThrow(
      new BadRequestException('El archivo de imagen no es válido')
    );
  });

  it('rechaza WebP que no contiene RIFF....WEBP', async () => {
    const body = Buffer.concat([Buffer.from('RIFF0000JPEG'), Buffer.alloc(4)]);
    await expect(service().upload(body.toString('base64'), 'image/webp')).rejects.toThrow(
      new BadRequestException('El archivo de imagen no es válido')
    );
  });

  it('responde 503 si falla Storage', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(service().upload(PNG.toString('base64'), 'image/png')).rejects.toThrow(
      new ServiceUnavailableException('No se pudo subir la foto')
    );
  });

  it('responde 503 si falta la clave de servicio', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    await expect(service().upload(PNG.toString('base64'), 'image/png')).rejects.toThrow(
      new ServiceUnavailableException('No se pudo subir la foto')
    );
  });

  it('solo considera propias las URLs del bucket productos', () => {
    expect(service().isManagedUrl(`${PREFIX}abc.png`)).toBe(true);
    expect(service().isManagedUrl(`${BASE_URL}/storage/v1/object/public/otro/abc.png`)).toBe(false);
    expect(service().isManagedUrl('https://externo.test/foto.png')).toBe(false);
  });

  it('borra un objeto propio con DELETE', async () => {
    await service().remove(`${PREFIX}abc.png`);
    const [target, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(target).toBe(`${BASE_URL}/storage/v1/object/portadas/productos/abc.png`);
    expect(init.method).toBe('DELETE');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer clave-de-prueba' });
  });

  it('rechaza borrar una URL fuera del bucket', async () => {
    await expect(service().remove('https://externo.test/foto.png')).rejects.toThrow(
      new BadRequestException('URL de foto no permitida')
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

Run: `npm -w apps/api test -- --runInBand src/admin/photo-storage.service.spec.ts`
Expected: FAIL con `Cannot find module './photo-storage.service'`.

- [ ] **Step 3: Implementar el servicio**

Crear `apps/api/src/admin/photo-storage.service.ts`:

```ts
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

  /** Prefijo de las URLs públicas que administra esta app. */
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
    } catch (err) {
      throw new ServiceUnavailableException('No se pudo subir la foto');
    }
    this.validate(buffer, contentType);

    const path = `productos/${randomUUID()}.${EXTENSION[contentType]}`;
    const target = `${this.baseUrl()}/storage/v1/object/portadas/${path}`;
    let res: Response;
    try {
      res = await fetch(target, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': contentType },
        body: buffer
      });
    } catch {
      throw new ServiceUnavailableException('No se pudo subir la foto');
    }
    if (!res.ok) throw new ServiceUnavailableException('No se pudo subir la foto');
    return `${this.publicUrlPrefix()}${path.split('/').pop()}`;
  }

  async remove(publicUrl: string): Promise<void> {
    if (!this.isManagedUrl(publicUrl)) {
      throw new BadRequestException('URL de foto no permitida');
    }
    const path = publicUrl.slice(this.publicUrlPrefix().length);
    const target = `${this.baseUrl()}/storage/v1/object/portadas/${path}`;
    try {
      const res = await fetch(target, { method: 'DELETE', headers: this.headers() });
      if (!res.ok) throw new Error(`Storage respondió ${res.status}`);
    } catch {
      throw new ServiceUnavailableException('No se pudo borrar la foto');
    }
  }
}
```

- [ ] **Step 4: Registrar el provider**

En `apps/api/src/admin/admin.module.ts`, agregar el import y el provider:

```ts
import { PhotoStorageService } from './photo-storage.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [AdminController],
  providers: [AdminCatalogService, AdminReportsService, PhotoStorageService, RolesGuard]
})
```

- [ ] **Step 5: Ejecutar y confirmar que pasa**

Run: `npm -w apps/api test -- --runInBand src/admin/photo-storage.service.spec.ts`
Expected: PASS (10 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/admin/photo-storage.service.ts apps/api/src/admin/photo-storage.service.spec.ts apps/api/src/admin/admin.module.ts
git commit -m "feat(api): servicio de Supabase Storage para fotos"
```

---

### Task 3: Endpoints ADMIN de subida y borrado

**Files:**
- Modify: `apps/api/src/admin/admin.controller.ts`
- Test: `apps/api/test/admin.e2e.spec.ts`

**Interfaces:**
- Consumes: `PhotoStorageService.upload/remove` (Task 2), `UploadPhotoDto`, `DeletePhotoDto` (Task 1).
- Produces: `POST /admin/products/photo` → `{ url }`; `DELETE /admin/products/photo` → `{ ok: true }`.

- [ ] **Step 1: Escribir los tests que fallan**

En `apps/api/test/admin.e2e.spec.ts`:

1. Importar `PhotoStorageService`:

```ts
import { PhotoStorageService } from '../src/admin/photo-storage.service';
```

2. Ampliar el tipo del helper y agregar el mock:

```ts
const asAdmin = (method: 'get' | 'post' | 'patch' | 'delete', path: string) =>
  (request(app.getHttpServer()) as any)[method](path).set('Cookie', 'sb_access=admin-token');

let photos: Record<string, jest.Mock>;
```

Dentro de `beforeAll`, antes de `Test.createTestingModule`:

```ts
photos = {
  upload: jest.fn(), remove: jest.fn(), isManagedUrl: jest.fn(), publicUrlPrefix: jest.fn()
};
```

Dentro de `providers`:

```ts
{ provide: PhotoStorageService, useValue: photos },
```

Dentro de `beforeEach`:

```ts
photos.upload.mockResolvedValue('https://demo.supabase.co/storage/v1/object/public/portadas/productos/abc.png');
photos.remove.mockResolvedValue(undefined);
photos.isManagedUrl.mockReturnValue(true);
```

3. Agregar tests al final del `describe`:

```ts
it('401 y 403 en la subida de fotos', async () => {
  const body = { fileName: 'foto.png', contentType: 'image/png', base64: 'aW1n' };
  await request(app.getHttpServer()).post('/admin/products/photo').send(body).expect(401);
  await request(app.getHttpServer())
    .post('/admin/products/photo').set('Cookie', 'sb_access=cliente-token').send(body).expect(403);
});

it('ADMIN sube una foto y devuelve la URL', async () => {
  const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  const res = await asAdmin('post', '/admin/products/photo')
    .send({ fileName: 'foto.png', contentType: 'image/png', base64: 'aW1n' })
    .expect(201);
  expect(res.body).toEqual({
    url: 'https://demo.supabase.co/storage/v1/object/public/portadas/productos/abc.png'
  });
  expect(photos.upload).toHaveBeenCalledWith('aW1n', 'image/png');
  expect(log).toHaveBeenCalledWith(expect.stringContaining('subir_foto id_usuario=1'));
});

it('400 si el tipo de foto no está permitido', async () => {
  const res = await asAdmin('post', '/admin/products/photo')
    .send({ fileName: 'foto.gif', contentType: 'image/gif', base64: 'aW1n' })
    .expect(400);
  expect(res.body.message).toContain('Formato de imagen no permitido (usa JPG, PNG o WebP)');
});

it('ADMIN borra una foto propia', async () => {
  const res = await asAdmin('delete', '/admin/products/photo')
    .send({ url: 'https://demo.supabase.co/storage/v1/object/public/portadas/productos/abc.png' })
    .expect(200);
  expect(res.body).toEqual({ ok: true });
  expect(photos.remove).toHaveBeenCalledWith(
    'https://demo.supabase.co/storage/v1/object/public/portadas/productos/abc.png'
  );
});
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

Run: `npm -w apps/api test -- --runInBand test/admin.e2e.spec.ts`
Expected: FAIL con `404` en `/admin/products/photo`.

- [ ] **Step 3: Implementar los endpoints**

En `apps/api/src/admin/admin.controller.ts`:

1. Cambiar la importación de `@nestjs/common` para incluir `Delete`:

```ts
import {
  Body, Controller, Delete, Get, Logger, Param, Patch, Post, Query, Req, UseFilters, UseGuards
} from '@nestjs/common';
```

2. Agregar imports:

```ts
import { DeletePhotoDto, UploadPhotoDto } from './dto/photo.dto';
import { PhotoStorageService } from './photo-storage.service';
```

3. Agregar al constructor:

```ts
private photos: PhotoStorageService
```

4. Insertar los handlers después de `createProduct` y antes de `updateProduct`:

```ts
@Post('products/photo')
async uploadPhoto(@Req() req: Request, @Body() dto: UploadPhotoDto) {
  const url = await this.photos.upload(dto.base64, dto.contentType);
  this.audit(req, 'subir_foto');
  return { url };
}

@Delete('products/photo')
async deletePhoto(@Req() req: Request, @Body() dto: DeletePhotoDto) {
  await this.photos.remove(dto.url);
  this.audit(req, 'borrar_foto');
  return { ok: true };
}
```

- [ ] **Step 4: Ejecutar y confirmar que pasa**

Run: `npm -w apps/api test -- --runInBand test/admin.e2e.spec.ts`
Expected: PASS (incluidos los 4 tests nuevos).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/admin/admin.controller.ts apps/api/test/admin.e2e.spec.ts
git commit -m "feat(api): endpoints para subir y borrar fotos"
```

---

### Task 4: Semántica de `fotoUrl` en DTO y catálogo

**Files:**
- Modify: `apps/api/src/admin/dto/product.dto.ts`
- Test: `apps/api/src/admin/dto/product.dto.spec.ts` (crear)
- Modify: `apps/api/src/admin/admin-catalog.service.ts`
- Test: `apps/api/src/admin/admin-catalog.service.spec.ts`
- Modify: `apps/api/src/admin/admin.module.ts` (inyección automática ya cubierta en Task 2; sin cambio)

**Interfaces:**
- Consumes: `PhotoStorageService.isManagedUrl/remove` (Task 2).
- Produces: `UpdateProductDto.fotoUrl?: string | null`, `UpdateProductDto.fotoUrlAnterior?: string | null`; `updateProduct` con semántica `undefined` = no tocar, `null` = quitar, URL = reemplazar.

- [ ] **Step 1: Escribir el test que falla para el DTO**

Crear `apps/api/src/admin/dto/product.dto.spec.ts`:

```ts
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProductDto, UpdateProductDto } from './product.dto';

describe('DTO de producto con foto', () => {
  it('acepta fotoUrl null al crear', async () => {
    const dto = plainToInstance(CreateProductDto, {
      idCategoria: 1, nombre: 'Carne', precio: 12, fotoUrl: null
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.fotoUrl).toBeNull();
  });

  it('acepta fotoUrl null al editar', async () => {
    const dto = plainToInstance(UpdateProductDto, { fotoUrl: null, fotoUrlAnterior: null });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('acepta fotoUrlAnterior con URL', async () => {
    const dto = plainToInstance(UpdateProductDto, {
      fotoUrl: 'https://demo.supabase.co/storage/v1/object/public/portadas/productos/nueva.png',
      fotoUrlAnterior: 'https://demo.supabase.co/storage/v1/object/public/portadas/productos/vieja.png'
    });
    expect(await validate(dto)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

Run: `npm -w apps/api test -- --runInBand src/admin/dto/product.dto.spec.ts`
Expected: FAIL porque `fotoUrlAnterior` no existe en el tipo/DTO.

- [ ] **Step 3: Actualizar los DTO**

En `apps/api/src/admin/dto/product.dto.ts`:

```ts
@IsOptional() @IsString() fotoUrl?: string | null;
```

en `CreateProductDto`, y en `UpdateProductDto`:

```ts
@IsOptional() @IsString() fotoUrl?: string | null;
@IsOptional() @IsString() fotoUrlAnterior?: string | null;
```

- [ ] **Step 4: Ejecutar y confirmar que pasa**

Run: `npm -w apps/api test -- --runInBand src/admin/dto/product.dto.spec.ts`
Expected: PASS.

- [ ] **Step 5: Escribir los tests que fallan para el catálogo**

Reemplazar la cabecera de `apps/api/src/admin/admin-catalog.service.spec.ts` por:

```ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AdminCatalogService } from './admin-catalog.service';
import { DatabaseService } from '../database/database.service';
import { PhotoStorageService } from './photo-storage.service';

const db = { query: jest.fn(), transaction: jest.fn() } as unknown as DatabaseService;
const photos = {
  isManagedUrl: jest.fn(), remove: jest.fn(), upload: jest.fn(), publicUrlPrefix: jest.fn()
} as unknown as PhotoStorageService;
const service = new AdminCatalogService(db, photos);

const photoRow = {
  id_producto: 1, id_categoria: 1, categoria: 'Salteñas', nombre: 'Carne',
  precio: '12.00', foto_url: null, activo: true, stock: 3, disponible_hoy: true
};

const mockUpdateFlow = (foto_url: string | null = null) => {
  (db.query as jest.Mock)
    .mockResolvedValueOnce({ rows: [{ nombre: 'Carne' }], rowCount: 1 }) // SELECT actual
    .mockResolvedValueOnce({ rows: [] })                                // UPDATE producto
    .mockResolvedValueOnce({ rows: [{ ...photoRow, foto_url }] });      // oneProduct
};
```

En `beforeEach`, cambiar `jest.clearAllMocks()` por:

```ts
beforeEach(() => {
  jest.clearAllMocks();
  (photos.isManagedUrl as jest.Mock).mockReturnValue(true);
  (photos.remove as jest.Mock).mockResolvedValue(undefined);
});
```

Agregar tests al final del describe:

```ts
it('fotoUrl ausente conserva la foto actual', async () => {
  mockUpdateFlow('https://demo.supabase.co/productos/vieja.png');
  await service.updateProduct('1', { nombre: 'Carne' });
  const [sql, params] = (db.query as jest.Mock).mock.calls[1];
  expect(sql).toContain('foto_url = CASE WHEN $6::boolean THEN $7::text ELSE foto_url END');
  expect(params[5]).toBe(false);
  expect(params[6]).toBeNull();
  expect(photos.remove).not.toHaveBeenCalled();
});

it('fotoUrl null quita la foto', async () => {
  mockUpdateFlow(null);
  const result = await service.updateProduct('1', { fotoUrl: null });
  const params = (db.query as jest.Mock).mock.calls[1][1];
  expect(params[5]).toBe(true);
  expect(params[6]).toBeNull();
  expect(result.fotoUrl).toBeNull();
});

it('fotoUrl con URL reemplaza y borra la anterior después del update', async () => {
  const anterior = 'https://demo.supabase.co/storage/v1/object/public/portadas/productos/vieja.png';
  const nueva = 'https://demo.supabase.co/storage/v1/object/public/portadas/productos/nueva.png';
  mockUpdateFlow(nueva);
  await service.updateProduct('1', { fotoUrl: nueva, fotoUrlAnterior: anterior });
  const params = (db.query as jest.Mock).mock.calls[1][1];
  expect(params[5]).toBe(true);
  expect(params[6]).toBe(nueva);
  expect(photos.isManagedUrl).toHaveBeenCalledWith(anterior);
  expect(photos.remove).toHaveBeenCalledWith(anterior);
  const updateOrder = (db.query as jest.Mock).mock.invocationCallOrder[1];
  const removeOrder = (photos.remove as jest.Mock).mock.invocationCallOrder[0];
  expect(removeOrder).toBeGreaterThan(updateOrder);
});

it('no borra si la foto anterior es igual a la nueva', async () => {
  const url = 'https://demo.supabase.co/storage/v1/object/public/portadas/productos/igual.png';
  mockUpdateFlow(url);
  await service.updateProduct('1', { fotoUrl: url, fotoUrlAnterior: url });
  expect(photos.remove).not.toHaveBeenCalled();
});

it('no borra una URL fuera del bucket', async () => {
  (photos.isManagedUrl as jest.Mock).mockReturnValue(false);
  mockUpdateFlow('https://externo.test/foto.png');
  await service.updateProduct('1', {
    fotoUrl: 'https://externo.test/foto.png',
    fotoUrlAnterior: 'https://otro.test/vieja.png'
  });
  expect(photos.remove).not.toHaveBeenCalled();
});
```

- [ ] **Step 6: Ejecutar y confirmar que falla**

Run: `npm -w apps/api test -- --runInBand src/admin/admin-catalog.service.spec.ts`
Expected: FAIL (`new AdminCatalogService(db, photos)` sobra argumento / SQL sin `CASE`).

- [ ] **Step 7: Implementar el catálogo**

En `apps/api/src/admin/admin-catalog.service.ts`:

1. Importar `Logger` y el servicio:

```ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException
} from '@nestjs/common';
import { PhotoStorageService } from './photo-storage.service';
```

2. Ampliar las interfaces:

```ts
export interface CreateProductDtoShape {
  idCategoria: number; nombre: string; descripcion?: string;
  precio: number; fotoUrl?: string | null; stock?: number; disponibleHoy?: boolean;
}
export interface UpdateProductDtoShape extends Partial<CreateProductDtoShape> {
  activo?: boolean;
  fotoUrlAnterior?: string | null;
}
```

3. Constructor y logger:

```ts
export class AdminCatalogService {
  private readonly logger = new Logger(AdminCatalogService.name);

  constructor(private db: DatabaseService, private photos: PhotoStorageService) {}
```

4. Reemplazar el `UPDATE producto` por:

```ts
await this.db.query(
  `UPDATE producto SET
     id_categoria = COALESCE($2, id_categoria), nombre = COALESCE($3, nombre),
     descripcion = COALESCE($4, descripcion), precio = COALESCE($5, precio),
     foto_url = CASE WHEN $6::boolean THEN $7::text ELSE foto_url END,
     activo = COALESCE($8, activo)
   WHERE id_producto = $1`,
  [productId, dto.idCategoria ?? null, dto.nombre ?? null, dto.descripcion ?? null,
   dto.precio === undefined ? null : dto.precio.toFixed(2),
   dto.fotoUrl !== undefined, dto.fotoUrl ?? null, dto.activo ?? null]
);
```

5. Reemplazar el final de `updateProduct` (`return this.oneProduct(productId);`) por:

```ts
const updated = await this.oneProduct(productId);

if (
  dto.fotoUrl !== undefined &&
  dto.fotoUrlAnterior &&
  dto.fotoUrlAnterior !== dto.fotoUrl &&
  this.photos.isManagedUrl(dto.fotoUrlAnterior)
) {
  try {
    await this.photos.remove(dto.fotoUrlAnterior);
  } catch (err) {
    this.logger.warn(
      `No se pudo borrar la foto anterior: ${err instanceof Error ? err.message : 'desconocido'}`
    );
  }
}

return updated;
```

- [ ] **Step 8: Ejecutar y confirmar que pasa**

Run: `npm -w apps/api test -- --runInBand src/admin/admin-catalog.service.spec.ts src/admin/dto/product.dto.spec.ts`
Expected: PASS.

- [ ] **Step 9: Suite API completa**

Run: `npm -w apps/api test -- --runInBand`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/admin/dto/product.dto.ts apps/api/src/admin/dto/product.dto.spec.ts apps/api/src/admin/admin-catalog.service.ts apps/api/src/admin/admin-catalog.service.spec.ts
git commit -m "feat(api): fotoUrl null y borrado de foto anterior"
```

---

### Task 5: Formulario del admin con selector, vista previa y limpieza

**Files:**
- Modify: `apps/web/src/app/admin/products/page.tsx`
- Test: `apps/web/src/app/admin/products/page.test.tsx`

**Interfaces:**
- Consumes: `api<T>()` (helper existente), `POST /admin/products/photo` → `{ url }`, `DELETE /admin/products/photo` → `{ ok: true }`.
- Produces: formulario con `fotoUrl` en `form`, `fotoOriginal`, `ultimaSubida`, `uploading`; `onPhotoChange`, `removePhoto`.

- [ ] **Step 1: Escribir los tests que fallan**

Reemplazar `apps/web/src/app/admin/products/page.test.tsx` por:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdminProducts from './page';
import { api } from '../../../lib/api';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
jest.mock('../../../lib/api', () => ({ api: jest.fn() }));

const photoUrl = 'https://ejemplo.supabase.co/storage/v1/object/public/portadas/productos/abc.png';
const product = {
  id: '7', idCategoria: '1', categoria: 'Salteñas', nombre: 'Carne',
  precio: '12.00', fotoUrl: null, activo: true, stock: 3, disponibleHoy: true
};
const productWithPhoto = { ...product, fotoUrl: photoUrl };
const category = { id: '1', nombre: 'Salteñas', activa: true, productCount: 1 };

type ProductFixture = typeof product | typeof productWithPhoto;
type MockOpts = { patchFails?: boolean; deleteFails?: boolean; products?: ProductFixture[] };

function mockApi(opts: MockOpts = {}) {
  (api as jest.Mock).mockImplementation((path: string, init?: RequestInit) => {
    if (path.startsWith('/admin/products?')) {
      return Promise.resolve({ products: opts.products ?? [product] });
    }
    if (path === '/admin/categories') return Promise.resolve({ categories: [category] });
    if (path === '/admin/products/photo' && init?.method === 'POST') {
      return Promise.resolve({ url: photoUrl });
    }
    if (path === '/admin/products/photo' && init?.method === 'DELETE') {
      return opts.deleteFails
        ? Promise.reject(new Error('No se pudo borrar la foto'))
        : Promise.resolve({ ok: true });
    }
    if (init?.method === 'PATCH') {
      return opts.patchFails ? Promise.reject(new Error('Sesión vencida')) : Promise.resolve({});
    }
    return Promise.resolve({});
  });
}

describe('AdminProducts', () => {
  beforeEach(() => { jest.resetAllMocks(); mockApi(); });
  afterEach(() => jest.restoreAllMocks());

  it('pide confirmación antes de desactivar', async () => {
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    render(<AdminProducts />);
    fireEvent.click(await screen.findByRole('button', { name: 'Desactivar' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(api).not.toHaveBeenCalledWith('/admin/products/7', expect.anything());
  });

  it('muestra error en español si falla la desactivación', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    mockApi({ patchFails: true });
    render(<AdminProducts />);
    fireEvent.click(await screen.findByRole('button', { name: 'Desactivar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo desactivar el producto');
  });

  it('muestra el error si falla la carga del catálogo', async () => {
    (api as jest.Mock).mockImplementation((path: string) => {
      if (path.startsWith('/admin/products?')) {
        return Promise.reject(new Error('No se pudo cargar la lista de productos'));
      }
      return Promise.resolve({ categories: [category] });
    });
    render(<AdminProducts />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo cargar la lista de productos'
    );
  });

  it('rechaza un archivo que no es imagen', async () => {
    render(<AdminProducts />);
    const input = await screen.findByLabelText('Foto del producto');
    fireEvent.change(input, { target: { files: [new File(['x'], 'foto.txt', { type: 'text/plain' })] } });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Formato de imagen no permitido (usa JPG, PNG o WebP)'
    );
    expect(api).not.toHaveBeenCalledWith('/admin/products/photo', expect.anything());
  });

  it('rechaza una foto de más de 5 MB', async () => {
    render(<AdminProducts />);
    const input = await screen.findByLabelText('Foto del producto');
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'grande.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [big] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('La foto debe pesar 5 MB o menos');
  });

  it('sube la foto, muestra vista previa y envía la URL al crear', async () => {
    render(<AdminProducts />);
    fireEvent.change(await screen.findByLabelText('Foto del producto'), {
      target: { files: [new File(['img'], 'foto.png', { type: 'image/png' })] }
    });
    expect(await screen.findByAltText('Vista previa de la foto')).toHaveAttribute('src', photoUrl);

    fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Carne' } });
    fireEvent.change(screen.getByLabelText('Precio Bs'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear producto' }));

    await waitFor(() => {
      const post = (api as jest.Mock).mock.calls.find(
        ([path, init]) => path === '/admin/products' && init?.method === 'POST'
      );
      expect(post).toBeDefined();
      expect(JSON.parse(post![1].body)).toMatchObject({ fotoUrl: photoUrl });
    });

    const upload = (api as jest.Mock).mock.calls.find(
      ([path, init]) => path === '/admin/products/photo' && init?.method === 'POST'
    );
    expect(JSON.parse(upload![1].body)).toEqual({
      fileName: 'foto.png', contentType: 'image/png', base64: 'aW1n'
    });
  });

  it('quita la foto y envía fotoUrlAnterior al editar', async () => {
    mockApi({ products: [productWithPhoto] });
    render(<AdminProducts />);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    expect(await screen.findByAltText('Vista previa de la foto')).toHaveAttribute('src', photoUrl);
    fireEvent.click(screen.getByRole('button', { name: 'Quitar foto' }));
    expect(screen.queryByAltText('Vista previa de la foto')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => {
      const patch = (api as jest.Mock).mock.calls.find(
        ([path, init]) => path === '/admin/products/7' && init?.method === 'PATCH'
      );
      expect(patch).toBeDefined();
      expect(JSON.parse(patch![1].body)).toMatchObject({
        fotoUrl: null, fotoUrlAnterior: photoUrl
      });
    });
  });

  it('limpia la foto subida si falla el guardado', async () => {
    mockApi({ patchFails: true });
    render(<AdminProducts />);
    fireEvent.change(await screen.findByLabelText('Foto del producto'), {
      target: { files: [new File(['img'], 'foto.png', { type: 'image/png' })] }
    });
    await screen.findByAltText('Vista previa de la foto');

    fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Carne' } });
    fireEvent.change(screen.getByLabelText('Precio Bs'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear producto' }));

    await waitFor(() => {
      expect(api).toHaveBeenCalledWith('/admin/products/photo', {
        method: 'DELETE',
        body: JSON.stringify({ url: photoUrl })
      });
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Sesión vencida');
  });
});
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

Run: `npm -w apps/web test -- --runInBand src/app/admin/products/page.test.tsx`
Expected: FAIL con `Unable to find a label with the text: Foto del producto`.

- [ ] **Step 3: Implementar el formulario**

Reemplazar `apps/web/src/app/admin/products/page.tsx` por:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { AdminCategory, AdminProduct } from '../../../lib/types';

type FormState = {
  idCategoria: string; nombre: string; precio: string; stock: string;
  fotoUrl: string | null;
};

const empty: FormState = { idCategoria: '', nombre: '', precio: '', stock: '', fotoUrl: null };
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

export default function AdminProducts() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [form, setForm] = useState<FormState>(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [fotoOriginal, setFotoOriginal] = useState<string | null>(null);
  const [ultimaSubida, setUltimaSubida] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    api<{ products: AdminProduct[] }>('/admin/products?includeInactive=true')
      .then((r) => setProducts(r.products))
      .catch((err) => {
        setProducts([]);
        setError(err instanceof Error ? err.message : 'No se pudo cargar la lista de productos');
      });
    api<{ categories: AdminCategory[] }>('/admin/categories')
      .then((r) => setCategories(r.categories))
      .catch((err) => {
        setCategories([]);
        setError(err instanceof Error ? err.message : 'No se pudo cargar las categorías');
      });
  };
  useEffect(load, []);

  const onPhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    if (!ALLOWED.includes(file.type)) {
      setError('Formato de imagen no permitido (usa JPG, PNG o WebP)');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('La foto debe pesar 5 MB o menos');
      return;
    }
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = String(reader.result);
        const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
        const uploaded = await api<{ url: string }>('/admin/products/photo', {
          method: 'POST',
          body: JSON.stringify({ fileName: file.name, contentType: file.type, base64 })
        });
        setForm((current) => ({ ...current, fotoUrl: uploaded.url }));
        setUltimaSubida(uploaded.url);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo subir la foto');
      } finally {
        setUploading(false);
      }
    };
    reader.onerror = () => {
      setUploading(false);
      setError('No se pudo subir la foto');
    };
    reader.readAsDataURL(file);
  };

  const removePhoto = () => setForm((current) => ({ ...current, fotoUrl: null }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const body: Record<string, unknown> = {
      idCategoria: Number(form.idCategoria), nombre: form.nombre,
      precio: Number(form.precio), stock: Number(form.stock || 0),
      fotoUrl: form.fotoUrl
    };
    if (editing && form.fotoUrl !== fotoOriginal) {
      body.fotoUrlAnterior = fotoOriginal ?? undefined;
    }
    try {
      if (editing) await api(`/admin/products/${editing}`, { method: 'PATCH', body: JSON.stringify(body) });
      else await api('/admin/products', { method: 'POST', body: JSON.stringify(body) });
      setForm(empty); setEditing(null); setFotoOriginal(null); setUltimaSubida(null); load();
    } catch (err) {
      if (ultimaSubida) {
        try {
          await api('/admin/products/photo', {
            method: 'DELETE', body: JSON.stringify({ url: ultimaSubida })
          });
        } catch {
          // La limpieza es best-effort; se conserva el error principal.
        }
        setUltimaSubida(null);
      }
      setError(err instanceof Error ? err.message : 'No se pudo guardar el producto');
    }
  };

  const deactivate = async (product: AdminProduct) => {
    if (!window.confirm(`¿Desactivar "${product.nombre}"? Dejará de estar disponible.`)) return;
    setError('');
    try {
      await api(`/admin/products/${product.id}`, {
        method: 'PATCH', body: JSON.stringify({ activo: false, disponibleHoy: false })
      });
      load();
    } catch {
      setError('No se pudo desactivar el producto');
    }
  };

  return (
    <section>
      <h1>Productos</h1>
      <form onSubmit={submit}>
        <label>Categoría
          <select value={form.idCategoria} onChange={(e) => setForm({ ...form, idCategoria: e.target.value })} required>
            <option value="">Elegí una categoría</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </label>
        <label>Nombre<input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required /></label>
        <label>Precio Bs<input type="number" min="0" step="0.01" value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })} required /></label>
        <label>Stock<input type="number" min="0" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></label>
        <div className="photo-field">
          <label htmlFor="producto-foto">Foto del producto</label>
          <input
            id="producto-foto" type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onPhotoChange}
          />
          {uploading && <p>Subiendo foto…</p>}
          {form.fotoUrl && (
            <div className="photo-actions">
              <img className="photo-preview" src={form.fotoUrl} alt="Vista previa de la foto" />
              <button type="button" onClick={removePhoto}>Quitar foto</button>
            </div>
          )}
        </div>
        <button type="submit">{editing ? 'Guardar cambios' : 'Crear producto'}</button>
      </form>
      {error && <p role="alert">{error}</p>}
      <div className="table-scroll">
      <table>
        <thead><tr><th>Producto</th><th>Categoría</th><th>Precio</th><th>Stock</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id}>
              <td>{p.nombre}</td><td>{p.categoria}</td><td>Bs {p.precio}</td>
              <td>{p.stock}</td><td>{p.activo ? (p.disponibleHoy ? 'Disponible' : 'Sin stock del día') : 'Inactivo'}</td>
              <td>
                <button onClick={() => {
                  setEditing(p.id);
                  setForm({ idCategoria: p.idCategoria, nombre: p.nombre, precio: p.precio, stock: String(p.stock), fotoUrl: p.fotoUrl });
                  setFotoOriginal(p.fotoUrl);
                  setUltimaSubida(null);
                }}>Editar</button>
                {p.activo && <button onClick={() => deactivate(p)}>Desactivar</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Ejecutar y confirmar que pasa**

Run: `npm -w apps/web test -- --runInBand src/app/admin/products/page.test.tsx`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/admin/products/page.tsx apps/web/src/app/admin/products/page.test.tsx
git commit -m "feat(web): selector y vista previa de foto en productos"
```

---

### Task 6: Estilos del campo de foto

**Files:**
- Modify: `apps/web/src/app/globals.css`
- Test: `apps/web/src/app/globals.css.test.ts`

**Interfaces:**
- Consumes: clases `.photo-field`, `.photo-preview`, `.photo-actions` del Task 5.
- Produces: estilos responsive sin cambiar la paleta ni los targets de 44 px.

- [ ] **Step 1: Escribir el test que falla**

Agregar a `apps/web/src/app/globals.css.test.ts`:

```ts
describe('campo de foto del admin', () => {
  it('define contenedor, vista previa y acciones', () => {
    expect(css).toMatch(/\.photo-field\s*\{/);
    expect(css).toMatch(/\.photo-preview\s*\{/);
    expect(css).toMatch(/\.photo-actions\s*\{/);
  });

  it('mantiene los targets de 44 px', () => {
    expect(css).toMatch(/min-height:\s*44px/);
  });
});
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

Run: `npm -w apps/web test -- --runInBand src/app/globals.css.test.ts`
Expected: FAIL con `.photo-field` no encontrado.

- [ ] **Step 3: Agregar los estilos**

Agregar después del bloque `input:focus, select:focus, textarea:focus` en `apps/web/src/app/globals.css`:

```css
.photo-field { display: grid; gap: 0.5rem; margin: 0.75rem 0; max-width: 320px; }
.photo-actions { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
.photo-preview {
  width: 96px; height: 72px; object-fit: cover;
  border: 1px solid var(--borde); border-radius: 12px; background: var(--crema-2);
}
```

- [ ] **Step 4: Ejecutar y confirmar que pasa**

Run: `npm -w apps/web test -- --runInBand src/app/globals.css.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/globals.css apps/web/src/app/globals.css.test.ts
git commit -m "style(web): campo de foto con vista previa"
```

---

### Task 7: E2E de subida, reemplazo y quitado

**Files:**
- Modify: `apps/web/e2e/admin.spec.ts`

**Interfaces:**
- Consumes: formulario del Task 5 y endpoints del Task 3 contra la API real con Storage configurado.
- Produces: flujo E2E que verifica `/admin/products` y `/menu` en los 3 viewports del `playwright.config.ts`.

- [ ] **Step 1: Escribir el test que falla**

En `apps/web/e2e/admin.spec.ts`, cambiar la importación existente por:

```ts
import { expect, test, type Page } from '@playwright/test';
```

Luego agregar al final del archivo:

```ts
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/wFfAAAAAElFTkSuQmCC',
  'base64'
);

test('admin sube, reemplaza y quita la foto del menú', async ({ page }) => {
  test.skip(!email || !password, 'Requiere E2E_ADMIN_EMAIL y E2E_ADMIN_PASSWORD');
  const name = `Foto ${randomUUID().slice(0, 8)}`;
  const fileInput = (p: Page) => p.getByLabel('Foto del producto');

  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL(/\/menu/);

  await page.goto('/admin/products', { waitUntil: 'networkidle' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await page.getByRole('combobox', { name: 'Categoría' }).selectOption({ index: 1 });
  await page.getByLabel('Nombre').fill(name);
  await page.getByLabel('Precio Bs').fill('9.50');
  await page.getByLabel('Stock').fill('3');
  await fileInput(page).setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByAltText('Vista previa de la foto')).toBeVisible();
  await page.getByRole('button', { name: 'Crear producto' }).click();

  const row = page.getByRole('row').filter({ hasText: name });
  await expect(row).toBeVisible();

  await page.goto(`/menu?search=${encodeURIComponent(name)}`, { waitUntil: 'networkidle' });
  const firstSrc = await page.getByRole('img', { name }).getAttribute('src');
  expect(firstSrc).toContain('/storage/v1/object/public/portadas/productos/');

  await page.goto('/admin/products', { waitUntil: 'networkidle' });
  await row.getByRole('button', { name: 'Editar' }).click();
  const preview = page.getByAltText('Vista previa de la foto');
  await expect(preview).toHaveAttribute('src', firstSrc!);
  await fileInput(page).setInputFiles({ name: 'foto2.png', mimeType: 'image/png', buffer: PNG });
  await expect(preview).not.toHaveAttribute('src', firstSrc!);
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(row).toBeVisible();

  await page.goto(`/menu?search=${encodeURIComponent(name)}`, { waitUntil: 'networkidle' });
  const secondSrc = await page.getByRole('img', { name }).getAttribute('src');
  expect(secondSrc).toContain('/portadas/productos/');
  expect(secondSrc).not.toBe(firstSrc);

  await page.goto('/admin/products', { waitUntil: 'networkidle' });
  await row.getByRole('button', { name: 'Editar' }).click();
  await page.getByRole('button', { name: 'Quitar foto' }).click();
  await expect(page.getByAltText('Vista previa de la foto')).toHaveCount(0);
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(row).toBeVisible();

  await page.goto(`/menu?search=${encodeURIComponent(name)}`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('img', { name })).toHaveAttribute('src', /placehold\.co/);

  page.once('dialog', (dialog) => dialog.accept());
  await row.getByRole('button', { name: 'Desactivar' }).click();
  await expect(row.getByText('Inactivo')).toBeVisible();
});
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

Run: `npm -w apps/web run e2e -- --grep "sube, reemplaza y quita"`
Expected: FAIL porque el campo “Foto del producto” no existe todavía en la rama previa al Task 5; al ejecutar después del Task 5, este paso debe pasar.

- [ ] **Step 3: Verificar que pasa con la implementación anterior**

Run: `npm -w apps/web run e2e -- --grep "sube, reemplaza y quita"`
Expected: PASS en los 3 projects (`360x800`, `768x1024`, `1366x768`). Si la API de Render está dormida, esperar el despertar y reintentar.

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/admin.spec.ts
git commit -m "test(e2e): foto en admin y menú"
```

---

### Task 8: Variables en Render, build final y despliegue

**Files:** ninguno en el repo además de los ya commiteados.

**Interfaces:**
- Consumes: commits de Tasks 1–7, `.env` local, token de Vercel en `C:\Users\airto\AppData\Local\Temp\opencode\vercel-token.txt`, URL en `vercel-url.txt`.
- Produces: API con Storage configurado y web desplegada, sin secretos versionados ni impresos.

- [ ] **Step 1: Agregar las variables en Render (autorizado)**

En `https://dashboard.render.com/web/srv-dc3sbgh7lnhs73emeis0/env`, agregar:

- `SUPABASE_URL` — copiar el valor de `.env` local.
- `SUPABASE_SERVICE_ROLE_KEY` — copiar el valor de `.env` local.

No imprimir los valores en chat, logs ni commits. Si el mecanismo del harness expone el valor al pasarlo al navegador, pedir al usuario que lo pegue manualmente en el dashboard. Guardar y esperar a que Render termine el redeploy; verificar que `/api/health` siga respondiendo.

- [ ] **Step 2: Build y suites completas antes de pedir aprobación**

Run:

```bash
npm -w apps/api test -- --runInBand
npm -w apps/web test -- --runInBand
npm -w apps/api run build
npm -w apps/web run build
```

Expected: todo PASS / build sin errores.

- [ ] **Step 3: Pedir aprobación explícita antes de publicar**

Preguntar al usuario antes de cualquier `git push`, deploy o cambio de variables adicional. Recordar que PR #2 no se tocó.

- [ ] **Step 4: Push (solo tras aprobación)**

```bash
git push
```

Expected: `feature/fase6-vercel` actualizada; Render dispara deploy automático.

- [ ] **Step 5: Deploy en Vercel (solo tras aprobación)**

En PowerShell, sin imprimir el token:

```powershell
$env:VERCEL_TOKEN = (Get-Content 'C:\Users\airto\AppData\Local\Temp\opencode\vercel-token.txt' -Raw).Trim()
npx --yes vercel@latest deploy --prod --yes
```

No ejecutar `Write-Host $env:VERCEL_TOKEN`.

- [ ] **Step 6: Verificación en producción**

- `GET https://saltenanga.vercel.app/api/health` → 200 y `Access-Control-Allow-Origin: https://saltenanga.vercel.app`.
- Login admin → 201 con rol `ADMIN`.
- Subir foto desde `/admin/products` → vista previa y URL `/portadas/productos/`.
- `/menu` muestra la imagen del producto; reemplazar y quitar confirman borrado y fallback a `placehold.co`.
- Si Supabase free está pausado (una semana sin actividad), reactivar el proyecto desde el dashboard antes de repetir la subida.
- Confirmar que `SUPABASE_SERVICE_ROLE_KEY` no aparece en el bundle de la web.

- [ ] **Step 7: No hacer merge de PR #2**

Dejar `https://github.com/AnaMaydana/ProyectoTW1/pull/2` abierto; no ejecutar merge ni cerrarlo.
