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
