import { randomUUID } from 'crypto';
import { expect, test, type Page } from '@playwright/test';

const email = process.env.E2E_ADMIN_EMAIL ?? '';
const password = process.env.E2E_ADMIN_PASSWORD ?? '';

test('admin crea y desactiva un producto', async ({ page }) => {
  test.skip(!email || !password, 'Requiere E2E_ADMIN_EMAIL y E2E_ADMIN_PASSWORD');
  const suffix = randomUUID().slice(0, 8);

  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL(/\/menu/);
  await page.waitForLoadState('networkidle');

  await page.goto('/admin/products', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Productos' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.getByRole('combobox', { name: 'Categoría' }).selectOption({ index: 1 });
  await page.getByLabel('Nombre').fill(`Prueba ${suffix}`);
  await page.getByLabel('Precio Bs').fill('9.50');
  await page.getByLabel('Stock').fill('3');
  await page.getByRole('button', { name: 'Crear producto' }).click();
  await expect(page.getByText(`Prueba ${suffix}`)).toBeVisible();

  const row = page.getByRole('row').filter({ hasText: `Prueba ${suffix}` });
  page.once('dialog', (dialog) => dialog.accept());
  await row.getByRole('button', { name: 'Desactivar' }).click();
  await expect(row.getByText('Inactivo')).toBeVisible();

  await page.goto('/admin/inventory', { waitUntil: 'networkidle' });
  const inventoryRow = page.getByRole('row').filter({ hasText: `Prueba ${suffix}` });
  await expect(inventoryRow.getByText('Stock bajo')).toBeVisible();
});

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
