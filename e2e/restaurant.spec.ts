import { test, expect, type Page } from '@playwright/test';
async function signIn(page: Page) {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(process.env.OWNER_EMAIL!);
  await page.getByLabel('Password', { exact: true }).fill(process.env.OWNER_PASSWORD!);
  await page.getByRole('button', { name: 'Gal' }).click();
  await expect(page).toHaveURL('/admin/orders/new');
}
test('signing in opens the order screen; a delivery order is taken and priced', async ({
  page,
}) => {
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Dalab cusub' })).toBeVisible();
  await page.getByRole('button', { name: 'Ku dar Suqaar Digaag' }).click();
  await page.getByRole('button', { name: 'Ku dar Suqaar Digaag' }).click();
  await page.getByRole('button', { name: 'Ku dar Botan Burger' }).click();
  await page
    .getByRole('dialog')
    .getByLabel(/Farmaajo dheeraad/)
    .check();
  await page.getByRole('dialog').getByRole('button', { name: 'Ku dar' }).click();
  await page.getByLabel('Telefoonka macmiilka').fill('615442493');
  await page.getByLabel('Magaca', { exact: true }).fill('Browser Guest');
  await page.getByLabel(/Cinwaanka/).fill('Bakaaro, agagaarka suuqa');
  await page.getByLabel('Delivery fee ($)').fill('1');
  await page.getByRole('button', { name: 'EVC Plus' }).click();
  // 19.00 + 8.50 = 27.50; 5% VAT 1.38; delivery 1.00
  await expect(page.locator('.take-total dd')).toHaveText('$29.88');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'waa la kaydiyey' })).toBeVisible();
  await expect(page.locator('.take-line')).toHaveCount(0);
});
test('the orders board shows pending orders and assigns a rider', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/delivery');
  await page.getByRole('button', { name: 'Ku dar darawal' }).click();
  const stamp = Date.now(),
    name = `Browser Rider ${stamp}`;
  await page.getByLabel('Magaca darawalka').fill(name);
  await page.getByLabel('Email-ka darawalka').fill(`rider-${stamp}@botan.local`);
  await page.getByLabel('Password-ka darawalka').fill('BrowserRider!Password26');
  await page.getByRole('button', { name: 'Kaydi darawalka' }).click();
  await expect(page.getByRole('cell', { name })).toBeVisible();
  await page.goto('/admin/orders');
  await expect(page.getByRole('heading', { name: 'Dalabyada' })).toBeVisible();
  const card = page.locator('.order-card').filter({ hasText: 'Browser Guest' }).first();
  await expect(card).toBeVisible();
  await card.getByRole('combobox').selectOption({ label: name });
  await expect(page.getByRole('status').filter({ hasText: 'qoondeeyey' })).toBeVisible();
  await page.getByRole('tab', { name: /Assigned/ }).click();
  await expect(page.locator('.order-card').filter({ hasText: name }).first()).toBeVisible();
});
test('signed-out visitors only see the login page', async ({ page }) => {
  await page.goto('/admin/orders');
  await expect(page).toHaveURL('/login');
  await expect(page.getByRole('heading', { name: 'Gal akoonkaaga' })).toBeVisible();
  await page.goto('/menu');
  await expect(page).toHaveURL('/login');
});
test('an owner adds a user who must choose a password at first sign-in', async ({
  page,
  browser,
}) => {
  await signIn(page);
  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { name: 'Isticmaalayaasha' })).toBeVisible();
  await page.getByRole('button', { name: 'Ku dar isticmaale' }).click();
  const dialog = page.getByRole('dialog');
  const stamp = Date.now(),
    email = `operator-${stamp}@botan.local`,
    name = `Browser Operator ${stamp}`;
  await dialog.getByLabel('Magaca oo dhan').fill(name);
  await dialog.getByLabel('Email (login)').fill(email);
  await dialog.getByText('Cashier', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Abuur akoonka' }).click();
  const temporary = (await page.locator('.temp-password code').textContent())!.trim();
  await expect(page.getByRole('link', { name: new RegExp(name) })).toBeVisible();

  const other = await (await browser.newContext()).newPage();
  await other.goto('/login');
  await other.getByLabel('Email', { exact: true }).fill(email);
  await other.getByLabel('Password', { exact: true }).fill(temporary);
  await other.getByRole('button', { name: 'Gal' }).click();
  await expect(other.getByRole('heading', { name: 'Dooro password kuu gaar ah' })).toBeVisible();
  await other.getByLabel('Password-ka ku meel gaarka ah').fill(temporary);
  await other.getByLabel('Password cusub').fill('BrowserOperator2026');
  await other.getByLabel('Ku celi password-ka cusub').fill('BrowserOperator2026');
  await other.getByRole('button', { name: 'Beddel password-ka' }).click();
  await expect(other).toHaveURL('/admin/orders/new');
  await expect(other.getByRole('link', { name: 'Isticmaalayaasha' })).toHaveCount(0);
});
test('an owner changes a role straight from the users list', async ({ page }) => {
  await signIn(page);
  const name = `Role Change ${Date.now()}`;
  const created = await page.request.post('/api/v1/admin/users', {
    data: { fullName: name, email: `role-${Date.now()}@botan.local`, role: 'RIDER' },
  });
  expect(created.status()).toBe(201);
  await page.goto('/admin/users');
  const row = page.locator('.user-table tr').filter({ hasText: name });
  await expect(row).toBeVisible();
  await row.getByRole('combobox').selectOption('CASHIER');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Waxay helayaan')).toBeVisible();
  await expect(dialog.getByText('+ Jooji dalab')).toBeVisible();
  await dialog.getByRole('button', { name: 'Xaqiiji' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'hadda waa Cashier' })).toBeVisible();
  await expect(row.getByRole('combobox')).toHaveValue('CASHIER');
});
