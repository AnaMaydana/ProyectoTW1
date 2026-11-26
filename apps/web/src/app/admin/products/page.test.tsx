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
type MockOpts = {
  patchFails?: boolean; createFails?: boolean; deleteFails?: boolean; products?: ProductFixture[]
};

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
    if (path === '/admin/products' && init?.method === 'POST') {
      return opts.createFails ? Promise.reject(new Error('Sesión vencida')) : Promise.resolve({});
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
    mockApi({ createFails: true });
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
