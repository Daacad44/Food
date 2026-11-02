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
