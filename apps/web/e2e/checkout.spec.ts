import { expect, test } from '@playwright/test';
import { ignoreHTTPSErrors } from './support/tls';

const email = `cliente-${Date.now()}-${Math.random().toString(36).slice(2)}@ejemplo.test`;
const password = 'secret123';

test('pedido en 5 pasos, sesión y carrito persistentes', async ({ page, browser }) => {
  // `networkidle` espera a que React hidrate: sin esto el form se envía como GET nativo.
  await page.goto('/menu', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Menú' })).toBeVisible();

  await page.getByRole('link', { name: 'Ingresar' }).click();
  await page.waitForLoadState('networkidle');
  await page.getByRole('link', { name: 'Registrate' }).click();
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveURL(/\/register/);

  await page.getByLabel('Nombre').fill('Ana');
  await page.getByLabel('Celular').fill('70000000');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page).toHaveURL(/\/menu/);
  await page.waitForLoadState('networkidle');

  await page.getByRole('button', { name: 'Agregar' }).first().click();
  // Esperar a que el carrito deje de estar vacío: `toBeVisible()` con
  // /Total: Bs/ también coincide con "Total: Bs 0.00" y puede capturar el
  // storageState antes de que la API cree la cookie `cart_id`.
  await expect(page.getByText(/Total: Bs/).first()).not.toHaveText(/^Total: Bs 0\.00$/);

  const state = await page.context().storageState();
  const viewport = page.viewportSize() ?? undefined;
  await page.close();
  await page.context().close();

  const context2 = await browser.newContext({ storageState: state, viewport, ignoreHTTPSErrors });
  const page2 = await context2.newPage();
  await page2.goto('/menu', { waitUntil: 'networkidle' });
  await expect(page2.getByText(/Total: Bs 0\.00/)).not.toBeVisible();
  await page2.goto('/checkout', { waitUntil: 'networkidle' });
  await page2.getByLabel('Hora de recojo').fill('10:00');
  await page2.getByRole('button', { name: 'Confirmar pedido' }).click();
  await expect(page2).toHaveURL(/\/order\/SAL-\d{8}-\d{4}/);
  const code = page2.url().split('/').pop() ?? '';
  expect(code).toMatch(/^SAL-\d{8}-\d{4}$/);
  await expect(page2.getByText(code, { exact: true })).toBeVisible();

  await page2.goto('/orders', { waitUntil: 'networkidle' });
  await expect(page2.getByText(code, { exact: true })).toBeVisible();
  await context2.close();
});
