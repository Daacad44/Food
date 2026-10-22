import { test, expect } from '@playwright/test';
test('customer browses, customises, checks out and tracks a real order', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Cunto fiican/ })).toBeVisible();
  await page.goto('/menu/beef-burger');
  await expect(page.getByRole('heading', { name: 'Botan Burger' })).toBeVisible();
  await page.getByLabel(/Farmaajo dheeraad/).check();
  await page.getByRole('button', { name: /Ku dar dambiisha/ }).click();
  await page.goto('/cart');
  await expect(page.getByRole('heading', { name: 'Botan Burger' })).toBeVisible();
  await expect(page.getByText('$8.50').first()).toBeVisible();
  await page.getByRole('link', { name: 'Sii wad checkout' }).click();
  await page.getByRole('button', { name: 'Soo qaado', exact: true }).click();
  await page.getByLabel('Magacaaga').fill('Browser Guest');
  await page.getByLabel('Telefoonka').fill('+252610002222');
  await page.getByRole('button', { name: 'Xaqiiji qiimaha' }).click();
  await expect(page.getByRole('button', { name: 'Xaqiiji dalabka', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Xaqiiji dalabka', exact: true }).click();
  await expect(page).toHaveURL(/\/order\/success\?token=/);
  await expect(page.getByRole('heading', { name: 'Dalabka waa la helay!' })).toBeVisible();
  await expect(page.getByText('Sugaya xaqiijin').first()).toBeVisible();
  await expect(page.getByText('$8.50').first()).toBeVisible();
  await page.getByRole('link', { name: 'Fur tracking link' }).click();
  await expect(page).toHaveURL(/\/track\//);
  await expect(page.getByText('Browser Guest')).toHaveCount(0);
});
test('owner signs in, sees real orders, edits a menu item and opens kitchen', async ({ page }) => {
  await page.goto('/login?staff=1');
  await page.getByLabel('Email', { exact: true }).fill(process.env.OWNER_EMAIL!);
  await page.getByLabel('Password', { exact: true }).fill(process.env.OWNER_PASSWORD!);
  await page.getByRole('button', { name: 'Gal akoonka' }).click();
  await expect(page).toHaveURL('/admin');
  await expect(page.getByRole('heading', { name: /Soo dhowow/ })).toBeVisible();
  await page.goto('/admin/menu');
  await expect(page.getByRole('heading', { name: 'The menu' })).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: 'Botan Burger' });
  await row.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page
    .getByLabel('Description', { exact: true })
    .fill('A fresh burger, updated and verified in the browser.');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('/kitchen');
  await expect(page.getByRole('heading', { name: 'Kitchen display', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Preparing/ })).toBeVisible();
  await page.goto('/admin/reports');
  await expect(page.getByRole('heading', { name: 'A clearer picture of Botan' })).toBeVisible();
});
test('mobile navigation, language choice and protected portals work', async ({
  page,
  isMobile,
}) => {
  await page.goto('/menu');
  await expect(page.getByRole('heading', { name: 'Wax kuu dhadhama.' })).toBeVisible();
  await page.getByRole('button', { name: 'Change language' }).click();
  await expect(page.getByRole('heading', { name: 'Find your next favourite.' })).toBeVisible();
  if (isMobile) {
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.getByRole('navigation').getByRole('link', { name: 'Our story' }).click();
    await expect(page.getByRole('heading', { name: 'Good food. Better company.' })).toBeVisible();
  }
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Botan team portal' })).toBeVisible();
  await page.goto('/menu');
  const width = await page.evaluate(() => ({
    body: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(width.body).toBeLessThanOrEqual(width.viewport + 1);
});

test('table QR starts a dine-in order without exposing staff access', async ({ page }) => {
  const login = await page.request.post('/api/v1/auth/staff/login', {
    data: { email: process.env.OWNER_EMAIL, password: process.env.OWNER_PASSWORD },
  });
  expect(login.ok()).toBe(true);
  const tables = await (await page.request.get('/api/v1/pos/tables')).json(),
    table = tables[0];
  const qr = await page.request.get('/api/v1/pos/tables/' + table.id + '/qr');
  expect(qr.ok()).toBe(true);
  expect(qr.headers()['content-type']).toContain('image/svg+xml');
  await page.request.post('/api/v1/auth/logout', { data: {} });
  await page.goto('/menu?table=' + table.qrToken);
  await expect(page.getByText('Welcome to your Botan table.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Add Bariis & Hilib', exact: true }).click();
  await page.goto('/checkout');
  await expect(page.getByRole('button', { name: 'Dine-in', exact: true })).toHaveClass(/active/);
  await page.getByLabel('Magacaaga').fill('Table Guest');
  await page.getByLabel('Telefoonka').fill('+252610003333');
  await page.getByRole('button', { name: 'Xaqiiji qiimaha' }).click();
  await page.getByRole('button', { name: 'Xaqiiji dalabka', exact: true }).click();
  await expect(page).toHaveURL(/\/order\/success/);
  await expect(page.getByRole('heading', { name: 'Dalabka waa la helay!' })).toBeVisible();
});
