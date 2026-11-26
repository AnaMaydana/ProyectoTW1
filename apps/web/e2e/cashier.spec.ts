import { expect, test } from '@playwright/test';
import { ignoreHTTPSErrors } from './support/tls';

const adminEmail = process.env.E2E_ADMIN_EMAIL ?? '';
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? '';
const clientEmail = `cliente-cajero-${Date.now()}-${Math.random().toString(36).slice(2)}@ejemplo.test`;
const clientPassword = 'secret123';

test('cajero cambia estados, entrega y muestra comprobante', async ({ browser }) => {
  test.skip(!adminEmail || !adminPassword, 'Requiere E2E_ADMIN_EMAIL y E2E_ADMIN_PASSWORD');

  const clientContext = await browser.newContext({ ignoreHTTPSErrors });
  const client = await clientContext.newPage();
  await client.addInitScript(() => {
    (window as unknown as { __printCalled: boolean }).__printCalled = false;
    window.print = () => { (window as unknown as { __printCalled: boolean }).__printCalled = true; };
  });
  await client.goto('/menu', { waitUntil: 'networkidle' });
  await client.getByRole('link', { name: 'Ingresar' }).click();
  await client.waitForLoadState('networkidle');
  await client.getByRole('link', { name: 'Registrate' }).click();
  await client.waitForLoadState('networkidle');
  await client.getByLabel('Nombre').fill('Ana');
  await client.getByLabel('Celular').fill('70000000');
  await client.getByLabel('Correo').fill(clientEmail);
  await client.getByLabel('Contraseña').fill(clientPassword);
  await client.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(client).toHaveURL(/\/menu/);
  await client.waitForLoadState('networkidle');
  const added = client.waitForResponse(
    (r) => r.url().includes('/cart/items') && r.request().method() === 'POST'
  );
  await client.getByRole('button', { name: 'Agregar' }).first().click();
  expect((await (await added).json()).cart.items.length).toBeGreaterThan(0);
  await client.goto('/checkout', { waitUntil: 'networkidle' });
  await client.getByLabel('Hora de recojo').fill('10:00');
  await client.getByRole('button', { name: 'Confirmar pedido' }).click();
  await expect(client).toHaveURL(/\/order\/SAL-\d{8}-\d{4}/);
  const code = client.url().split('/').pop() ?? '';
  expect(code).toMatch(/^SAL-\d{8}-\d{4}$/);
  await expect(client.locator('[data-testid="order-qr"] svg')).toBeVisible();

  const adminContext = await browser.newContext({ ignoreHTTPSErrors });
  const cashier = await adminContext.newPage();
  await cashier.goto('/login', { waitUntil: 'networkidle' });
  await cashier.getByLabel('Correo').fill(adminEmail);
  await cashier.getByLabel('Contraseña').fill(adminPassword);
  await cashier.getByRole('button', { name: 'Ingresar' }).click();
  await expect(cashier).toHaveURL(/\/menu/);
  await cashier.waitForLoadState('networkidle');
  await cashier.goto('/cashier', { waitUntil: 'networkidle' });
  await expect(cashier.getByRole('heading', { name: 'Cajero' })).toBeVisible();

  const row = cashier.getByRole('row').filter({ hasText: code });
  const steps = [
    ['Confirmar', 'CONFIRMADO'],
    ['Preparar', 'PREPARANDO'],
    ['Marcar listo', 'LISTO']
  ] as const;
  for (const [label, status] of steps) {
    await row.getByRole('button', { name: label }).click();
    await expect(row).toContainText(status);
  }
  await cashier.getByLabel('Código del pedido (escaneá o escribí)').fill(`  ${code.toLowerCase()} `);
  await cashier.getByRole('button', { name: 'Buscar' }).click();
  await cashier.getByRole('button', { name: 'Confirmar entrega' }).click();
  await expect(cashier.getByText(/COM-\d{8}-\d{4}/)).toBeVisible();

  await client.goto(`/order/${code}`, { waitUntil: 'networkidle' });
  await expect(client.getByText(/COM-\d{8}-\d{4}/)).toBeVisible();
  await client.getByRole('link', { name: 'Descargar comprobante' }).click();
  await expect(client).toHaveURL(/\/comprobante$/);
  await expect(client.getByText(/COM-\d{8}-\d{4}/)).toBeVisible();
  await expect(client.locator('.comprobante tbody tr').first().locator('td').first()).not.toBeEmpty();
  await expect(client.locator('.comprobante-total')).toContainText(/Bs \d+\.\d{2}/);
  await expect(client.locator('[data-testid="comprobante-qr"] svg')).toBeVisible();

  await client.getByRole('button', { name: 'Imprimir / guardar como PDF' }).click();
  expect(await client.evaluate(() => (window as any).__printCalled)).toBe(true);

  await client.emulateMedia({ media: 'print' });
  await expect(client.locator('.site-header')).toBeHidden();
  await expect(client.getByRole('button', { name: 'Imprimir / guardar como PDF' })).toBeHidden();
  await client.emulateMedia({ media: 'screen' });

  for (const page of [cashier, client]) {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }
  await clientContext.close();
  await adminContext.close();
});
