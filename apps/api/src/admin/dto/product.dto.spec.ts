import 'reflect-metadata';
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
