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
    expect(url.startsWith(PREFIX)).toBe(true);
    expect(url).toMatch(/\.png$/);
    const [target, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(target).toBe(`${BASE_URL}/storage/v1/object/portadas/productos/${url.split('/').pop()}`);
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
