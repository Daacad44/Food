import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });
config({ quiet: true });
const { db } = await import('../src/lib/db');
const { passwordHash } = await import('../src/lib/security');
const email = process.env.OWNER_EMAIL,
  password = process.env.OWNER_PASSWORD;
if (!email || !password || password.length < 12)
  throw new Error('Set OWNER_EMAIL and OWNER_PASSWORD (12+ characters) securely before seeding');
const restaurant = await db.restaurant.upsert({
  where: { slug: 'botan' },
  update: {},
  create: {
    slug: 'botan',
    name: 'Botan Restaurant',
    phone: '+252 61 000 0000',
    address: 'Mogadishu, Somalia',
    timezone: 'Africa/Mogadishu',
    settings: { create: { taxRate: 0, minimumOrder: 3, averagePrepMinutes: 25 } },
    hours: {
      create: Array.from({ length: 7 }, (_, dayOfWeek) => ({
        dayOfWeek,
        opensAt: '07:00',
        closesAt: '23:30',
      })),
    },
  },
});
await db.staffUser.upsert({
  where: { email },
  update: {},
  create: {
    restaurantId: restaurant.id,
    fullName: 'Botan Owner',
    email,
    passwordHash: await passwordHash(password),
    role: 'OWNER',
  },
});
const categoryData = [
  ['signature', 'Saxiixa Botan', 'Signature dishes from our kitchen'],
  ['grill', 'Dabka & Grill', 'Freshly grilled, full of flavour'],
  ['bowls', 'Bariis & Bowls', 'Comfort in every bowl'],
  ['drinks', 'Cabitaanno', 'Fresh, bright and refreshing'],
];
const categories: Record<string, string> = {};
for (let n = 0; n < categoryData.length; n++) {
  const [slug, name, description] = categoryData[n];
  const c = await db.menuCategory.upsert({
    where: { restaurantId_slug: { restaurantId: restaurant.id, slug } },
    update: {},
    create: { restaurantId: restaurant.id, slug, name, description, sortOrder: n },
  });
  categories[slug] = c.id;
}
const items = [
  [
    'bariis-hilib',
    'Bariis & Hilib',
    'Bariis udgoon, hilib ari oo jilicsan, moos iyo salad cusub.',
    'signature',
    12.5,
    'photo-1547592180-85f173990554',
    true,
  ],
  [
    'chicken-suqaar',
    'Suqaar Digaag',
    'Digaag la shiilay, khudaar cusub iyo xawaashka gaarka ah ee Botan.',
    'signature',
    9.5,
    'photo-1604908177225-c457fa9c1d3b',
    true,
  ],
  [
    'grilled-chicken',
    'Digaag Dabka',
    'Digaag la dubay oo leh liin, basbaas iyo maraq gaar ah.',
    'grill',
    11,
    'photo-1532550907401-a500c9a57435',
    true,
  ],
  [
    'beef-burger',
    'Botan Burger',
    'Hilib lo’aad cusub, farmaajo, salad iyo suugo guriga lagu sameeyey.',
    'grill',
    7.5,
    'photo-1568901346375-23c9450c58cd',
    true,
  ],
  [
    'salmon-bowl',
    'Salmon Bowl',
    'Kalluun la dubay, bariis, avocado iyo khudaar xilliyeed.',
    'bowls',
    14,
    'photo-1510130387422-82bed34b37e9',
    false,
  ],
  [
    'vegetable-bowl',
    'Khudaar Bowl',
    'Khudaar midabbo leh, chickpeas, bariis iyo tahini.',
    'bowls',
    7,
    'photo-1512621776951-a57141f2eefd',
    true,
  ],
  [
    'fresh-mango',
    'Cambaha Cusub',
    'Casiir cambe dabiici ah oo qabow.',
    'drinks',
    3,
    'photo-1622597467836-f3285f2131b8',
    false,
  ],
  [
    'somali-shaah',
    'Shaah Soomaali',
    'Shaah caano leh, hayl, qorfe iyo dhadhan guriga.',
    'drinks',
    2,
    'photo-1544787219-7f47ccb76574',
    false,
  ],
  [
    'pasta-bolognese',
    'Baasto Hilib',
    'Baasto cusub, suugo yaanyo iyo hilib shiidan.',
    'signature',
    8.5,
    'photo-1551892374-ecf8754cf8b0',
    false,
  ],
  [
    'grilled-fish',
    'Kalluun Dabka',
    'Kalluun cusub oo badda, liin iyo khudaar la dubay.',
    'grill',
    13,
    'photo-1510130387422-82bed34b37e9',
    false,
  ],
] as const;
for (let n = 0; n < items.length; n++) {
  const [slug, name, description, category, basePrice, photo, isFeatured] = items[n];
  await db.menuItem.upsert({
    where: { restaurantId_slug: { restaurantId: restaurant.id, slug } },
    update: {},
    create: {
      restaurantId: restaurant.id,
      categoryId: categories[category],
      slug,
      name,
      description,
      basePrice,
      imageUrl:
        (
          {
            'beef-burger': '/images/burger.jpg',
            'bariis-hilib': '/images/biryani.jpg',
            'chicken-suqaar': '/images/chicken.jpg',
            'grilled-chicken': '/images/chicken.jpg',
            'pasta-bolognese': '/images/pasta.jpg',
            'vegetable-bowl': '/images/rice.jpg',
          } as Record<string, string>
        )[slug] || '/food-placeholder.svg',
      isFeatured,
      sortOrder: n,
    },
  });
}
for (const [name, deliveryFee, etaMinutes] of [
  ['Hodan', 2, 30],
  ['Wadajir', 2.5, 35],
  ['Waberi', 2, 30],
  ['Hamar Weyne', 3, 40],
] as const)
  await db.deliveryZone.upsert({
    where: { restaurantId_name: { restaurantId: restaurant.id, name } },
    update: {},
    create: { restaurantId: restaurant.id, name, deliveryFee, etaMinutes },
  });
for (let n = 1; n <= 8; n++)
  await db.diningTable.upsert({
    where: { restaurantId_tableNumber: { restaurantId: restaurant.id, tableNumber: String(n) } },
    update: {},
    create: { restaurantId: restaurant.id, tableNumber: String(n), capacity: n < 5 ? 4 : 6 },
  });
await db.coupon.upsert({
  where: { restaurantId_code: { restaurantId: restaurant.id, code: 'BOTAN10' } },
  update: {},
  create: {
    restaurantId: restaurant.id,
    code: 'BOTAN10',
    type: 'PERCENTAGE',
    value: 10,
    minSpend: 10,
    maxDiscount: 5,
    usageLimit: 1000,
  },
});
const stock = await db.inventoryItem.upsert({
  where: { restaurantId_name: { restaurantId: restaurant.id, name: 'Burger patties' } },
  update: {},
  create: {
    restaurantId: restaurant.id,
    name: 'Burger patties',
    unit: 'PIECE',
    quantityOnHand: 100,
    reorderLevel: 15,
    averageUnitCost: 2,
  },
});
const burger = await db.menuItem.findUniqueOrThrow({
  where: { restaurantId_slug: { restaurantId: restaurant.id, slug: 'beef-burger' } },
});
await db.recipeIngredient.upsert({
  where: { menuItemId_inventoryItemId: { menuItemId: burger.id, inventoryItemId: stock.id } },
  update: {},
  create: { menuItemId: burger.id, inventoryItemId: stock.id, quantity: 1 },
});
let group = await db.modifierGroup.findFirst({
  where: { restaurantId: restaurant.id, name: 'Ku dar' },
});
if (!group)
  group = await db.modifierGroup.create({
    data: {
      restaurantId: restaurant.id,
      name: 'Ku dar',
      minSelect: 0,
      maxSelect: 2,
      options: {
        create: [
          { name: 'Farmaajo dheeraad ah', priceDelta: 1 },
          { name: 'Avocado', priceDelta: 1.5 },
        ],
      },
    },
  });
await db.menuItemModifierGroup.upsert({
  where: { menuItemId_groupId: { menuItemId: burger.id, groupId: group.id } },
  update: {},
  create: { menuItemId: burger.id, groupId: group.id },
});
console.log(
  'Seed complete: restaurant, owner, 10 menu items, 4 delivery zones, 8 tables, coupon, modifiers, and sample inventory. Existing records preserved.',
);
await db.$disconnect();
