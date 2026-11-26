import { IsIn, IsString, Length, Matches, MinLength } from 'class-validator';

export type AllowedPhotoContentType = 'image/jpeg' | 'image/png' | 'image/webp';

const ALLOWED: AllowedPhotoContentType[] = ['image/jpeg', 'image/png', 'image/webp'];

export class UploadPhotoDto {
  @IsString() @Length(1, 255) @MinLength(1)
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
