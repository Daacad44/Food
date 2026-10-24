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
  await expect(page.getByRole('heading', { name: /^Jikada/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Diyaarin/ })).toBeVisible();
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

test('menu description search and availability filter use the same result list', async ({
  page,
}) => {
  await page.goto('/menu');
  await page.getByRole('textbox', { name: 'Search menu' }).fill('udgoon');
  await expect(page.getByRole('heading', { name: 'Bariis & Hilib', exact: true })).toBeVisible();
  await expect(page.getByText('Cunto lama helin.', { exact: true })).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Kuwa la heli karo oo keliya' }).check();
  await expect(page.getByRole('heading', { name: 'Bariis & Hilib', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Search menu' }).fill('no-such-dish');
  await expect(page.getByRole('heading', { name: 'Cunto lama helin.' })).toBeVisible();
  await page.getByRole('button', { name: 'Nadiifi raadinta' }).click();
  await expect(page.getByRole('heading', { name: 'Botan Burger', exact: true })).toBeVisible();
});

test('tracking entry rejects order-number guessing and resumes a saved private link', async ({
  page,
}) => {
  const token = 'a'.repeat(64);
  await page.addInitScript(
    ({ token }) =>
      sessionStorage.setItem(
        'botan-last-order',
        JSON.stringify({ token, orderNumber: 'BTN-SAVED' }),
      ),
    { token },
  );
  await page.goto('/track');
  await page.getByLabel('Tracking link ama koodh', { exact: true }).fill('BTN-123');
  await page.getByRole('button', { name: 'Raadi dalabkayga' }).click();
  await expect(page.locator('main').getByRole('alert')).toContainText(
    'Lambarka dalabka keliya kuma filna',
  );
  await expect(page.getByRole('link', { name: 'Sii wad tracking' })).toHaveAttribute(
    'href',
    '/track/' + token,
  );
  await page.getByRole('button', { name: 'Ka saar tab-kan' }).click();
  await expect(page.getByRole('link', { name: 'Sii wad tracking' })).toHaveCount(0);
  await page
    .getByLabel('Tracking link ama koodh', { exact: true })
    .fill('https://food.daljir.tech/track/' + token);
  await page.getByRole('button', { name: 'Raadi dalabkayga' }).click();
  await expect(page).toHaveURL('/track/' + token);
  await expect(page.locator('main').getByRole('alert')).toContainText('Order not found');
});

test('delivery tracking updates from order received to dispatched and delivered', async ({
  page,
}) => {
  const login = await page.request.post('/api/v1/auth/staff/login', {
    data: { email: process.env.OWNER_EMAIL, password: process.env.OWNER_PASSWORD },
  });
  expect(login.ok()).toBe(true);
  const menu = await (await page.request.get('/api/v1/menu/items')).json();
  const zones = await (await page.request.get('/api/v1/delivery/zones')).json();
  const created = await page.request.post('/api/v1/orders', {
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    data: {
      items: [
        { menuItemId: menu[0].id, quantity: 1, modifierOptionIds: [], specialInstructions: '' },
      ],
      type: 'DELIVERY',
      guestName: 'Private Tracking Guest',
      guestPhone: '+252610004444',
      zoneId: zones[0].id,
      deliveryAddress: 'Private test address',
    },
  });
  expect(created.ok()).toBe(true);
  const order = await created.json();
  await page.goto('/track/' + order.token);
  await expect(page.locator('[aria-current="step"]')).toContainText('Dalabkii waa la helay');
  for (const status of ['CONFIRMED', 'PREPARING', 'READY'])
    expect(
      (
        await page.request.patch('/api/v1/admin/orders/' + order.id + '/status', {
          data: { status },
        })
      ).ok(),
    ).toBe(true);
  const details = await (await page.request.get('/api/v1/admin/orders/' + order.id)).json();
  const riders = await (await page.request.get('/api/v1/admin/delivery/riders')).json();
  expect(
    (
      await page.request.patch('/api/v1/admin/deliveries/' + details.delivery.id, {
        data: { riderId: riders[0].id },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await page.request.patch('/api/v1/admin/orders/' + order.id + '/status', {
        data: { status: 'OUT_FOR_DELIVERY' },
      })
    ).ok(),
  ).toBe(true);
  await expect(page.locator('[aria-current="step"]')).toContainText('Waddada ku jira', {
    timeout: 10000,
  });
  await expect(page.getByText('Rider-ku wuu qaaday cuntada')).toBeVisible();
  expect(
    (
      await page.request.post('/api/v1/payments/' + details.payments[0].id + '/capture', {
        data: {},
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await page.request.patch('/api/v1/admin/orders/' + order.id + '/status', {
        data: { status: 'COMPLETED' },
      })
    ).ok(),
  ).toBe(true);
  await expect(page.locator('[aria-current="step"]')).toContainText('Waa la geeyey', {
    timeout: 10000,
  });
  await expect(page.getByText('Private Tracking Guest')).toHaveCount(0);
  await expect(page.getByText('Private test address')).toHaveCount(0);
});

async function deliveryReady(page: import('@playwright/test').Page, guestName: string) {
  const login = await page.request.post('/api/v1/auth/staff/login', {
    data: { email: 'test-owner@botan.local', password: 'IntegrationTest!Password26' },
  });
  expect(login.ok()).toBe(true);
  const menu = await (await page.request.get('/api/v1/menu/items')).json(),
    zones = await (await page.request.get('/api/v1/delivery/zones')).json();
  const created = await page.request.post('/api/v1/orders', {
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    data: {
      items: [
        {
          menuItemId: menu.find((item: any) => item.slug === 'chicken-suqaar').id,
          quantity: 1,
          modifierOptionIds: [],
          specialInstructions: '',
        },
      ],
      type: 'DELIVERY',
      guestName,
      guestPhone: '+252610005555',
      zoneId: zones[0].id,
      deliveryAddress: 'Test driver delivery address',
    },
  });
  expect(created.ok()).toBe(true);
  const order = await created.json();
  for (const status of ['CONFIRMED', 'PREPARING', 'READY'])
    expect(
      (
        await page.request.patch('/api/v1/admin/orders/' + order.id + '/status', {
          data: { status },
        })
      ).ok(),
    ).toBe(true);
  return order;
}

test('admin creates and assigns a driver on the order, then that driver completes delivery', async ({
  page,
  browser,
  baseURL,
  isMobile,
}) => {
  const guestName = 'Driver flow ' + crypto.randomUUID().slice(0, 8),
    order = await deliveryReady(page, guestName);
  await page.goto('/admin/orders/' + order.id);
  const dispatch = page.getByRole('button', { name: 'Waddada ku jira', exact: true });
  await expect(dispatch).toBeDisabled();
  await page.getByRole('button', { name: 'Ku dar darawal', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Ku dar darawal' }),
    email = 'rider-' + crypto.randomUUID() + '@example.test',
    password = 'BrowserRider!Password26';
  await dialog.getByLabel('Magaca darawalka', { exact: true }).fill('Browser Delivery Driver');
  await dialog.getByLabel('Email-ka darawalka', { exact: true }).fill(email);
  await dialog.getByLabel('Telefoonka darawalka', { exact: true }).fill('+252610006666');
  await dialog.getByLabel('Password-ka darawalka', { exact: true }).fill(password);
  await dialog.getByRole('button', { name: 'Kaydi darawalka', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'U qoondee darawal', exact: true }).click();
  await expect(dispatch).toBeEnabled();
  const context = await browser.newContext({ baseURL, viewport: page.viewportSize()!, isMobile });
  try {
    expect(
      (await context.request.post('/api/v1/auth/staff/login', { data: { email, password } })).ok(),
    ).toBe(true);
    const driver = await context.newPage();
    await driver.goto('/rider');
    await driver.locator('button.rider-card').filter({ hasText: guestName }).click();
    await driver.getByRole('button', { name: 'Xaqiiji qaadashada', exact: true }).click();
    await driver
      .getByLabel('Caddaynta gaarsiinta', { exact: true })
      .fill('Delivered directly to customer by the assigned driver.');
    await driver.getByRole('checkbox', { name: /cash la qaaday/ }).check();
    await driver.getByRole('button', { name: 'Xaqiiji in la geeyey', exact: true }).click();
    await expect(driver.getByRole('status')).toContainText('Gaarsiinta waa la dhammeeyey');
    await driver.goto('/rider/history');
    await expect(driver.locator('button.rider-card').filter({ hasText: guestName })).toBeVisible();
    const details = await (await page.request.get('/api/v1/admin/orders/' + order.id)).json();
    expect(details.status).toBe('COMPLETED');
    expect(details.paymentStatus).toBe('PAID');
    expect(details.delivery.status).toBe('DELIVERED');
  } finally {
    await context.close();
  }
});

test('admin confirms delivered and cash collected without requiring an onboarded driver', async ({
  page,
}) => {
  const order = await deliveryReady(page, 'Admin completion ' + crypto.randomUUID().slice(0, 8));
  await page.goto('/admin/orders/' + order.id);
  await page
    .getByLabel('Caddaynta gaarsiinta', { exact: true })
    .fill('Manager verified delivery with the customer.');
  await page.getByRole('checkbox', { name: /cash la qaaday/ }).check();
  await page.getByRole('button', { name: 'Xaqiiji in la geeyey', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Gaarsiinta waa la dhammeeyey');
  const details = await (await page.request.get('/api/v1/admin/orders/' + order.id)).json();
  expect(details.status).toBe('COMPLETED');
  expect(details.paymentStatus).toBe('PAID');
  expect(details.delivery.riderId).toBeNull();
  expect(details.delivery.proofNote).toContain('Manager verified');
});
