import { expect, test } from '@playwright/test';

const email = `cliente-${Date.now()}@ejemplo.test`;
const password = 'secret123';

test('pedido en 5 pasos, sesión y carrito persistentes', async ({ page, browser }) => {
  await page.goto('/menu');
  await expect(page.getByRole('heading', { name: 'Menú' })).toBeVisible();

  await page.getByRole('link', { name: 'Ingresar' }).click();
  await page.getByLabel('Nombre').fill('Ana');
  await page.getByLabel('Celular').fill('70000000');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page).toHaveURL(/\/menu/);

  await page.getByRole('button', { name: 'Agregar' }).first().click();
  await expect(page.getByText(/Total: Bs/)).toBeVisible();

  const state = await page.context().storageState();
  const viewport = page.viewportSize() ?? undefined;
  await page.close();
  await page.context().close();

  const context2 = await browser.newContext({ storageState: state, viewport });
  const page2 = await context2.newPage();
  await page2.goto('/menu');
  await expect(page2.getByText(/Total: Bs 0\.00/)).not.toBeVisible();
  await page2.goto('/checkout');
  await page2.getByLabel('Hora de recojo').fill('10:00');
  await page2.getByRole('button', { name: 'Confirmar pedido' }).click();
  await expect(page2.getByText(/SAL-\d{8}-\d{4}/)).toBeVisible();

  await page2.goto('/orders');
  await expect(page2.getByText(/SAL-\d{8}-\d{4}/)).toBeVisible();
  await context2.close();
});
