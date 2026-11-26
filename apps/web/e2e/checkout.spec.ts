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
  // El detalle ya no está al final de la página: se abre desde el icono de la
  // cabecera. Esperar al contador evita capturar el storageState antes de que
  // la API cree la cookie `cart_id`.
  await expect(page.getByRole('button', { name: /Abrir carrito/i })).toHaveText('1');
  await page.getByRole('button', { name: /Abrir carrito/i }).click();
  await expect(page.getByText(/Total: Bs/)).not.toHaveText(/^Total: Bs 0\.00$/);

  const state = await page.context().storageState();
  const viewport = page.viewportSize() ?? undefined;
  await page.close();
  await page.context().close();

  const context2 = await browser.newContext({ storageState: state, viewport, ignoreHTTPSErrors });
  const page2 = await context2.newPage();
  await page2.goto('/menu', { waitUntil: 'networkidle' });
  await page2.getByRole('button', { name: /Abrir carrito/i }).click();
  await expect(page2.getByText(/Total: Bs/)).not.toHaveText(/^Total: Bs 0\.00$/);
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
