import { expect, test } from '@playwright/test';

const email = process.env.E2E_ADMIN_EMAIL ?? '';
const password = process.env.E2E_ADMIN_PASSWORD ?? '';

test('admin crea y desactiva un producto', async ({ page }) => {
  test.skip(!email || !password, 'Requiere E2E_ADMIN_EMAIL y E2E_ADMIN_PASSWORD');
  const suffix = Date.now().toString().slice(-6);

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
