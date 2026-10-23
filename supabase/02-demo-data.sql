-- Run AFTER 01-schema.sql. Repeatable: existing prices, stock and settings are preserved.
-- These are sample menu items and delivery areas, not a production restaurant menu.
BEGIN;
SET LOCAL search_path = public, pg_catalog;
SELECT pg_advisory_xact_lock(hashtext('botan-sql-setup'));
DO $botan_seed$
DECLARE
  restaurant_id UUID;
  category_id UUID;
  burger_id UUID;
  stock_id UUID;
  modifier_id UUID;
  row RECORD;
  n INTEGER;
BEGIN
  INSERT INTO "Restaurant" (id,name,slug,phone,address,timezone,"updatedAt")
  VALUES (gen_random_uuid(),'Botan Restaurant','botan','+252 61 000 0000','Mogadishu, Somalia','Africa/Mogadishu',now())
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO STRICT restaurant_id FROM "Restaurant" WHERE slug='botan';
  INSERT INTO "RestaurantSettings" (id,"restaurantId","taxRate","minimumOrder","averagePrepMinutes","updatedAt")
  VALUES (gen_random_uuid(),restaurant_id,0,3,25,now()) ON CONFLICT ("restaurantId") DO NOTHING;
  FOR n IN 0..6 LOOP
    INSERT INTO "OpeningHour" (id,"restaurantId","dayOfWeek","opensAt","closesAt")
    VALUES (gen_random_uuid(),restaurant_id,n,'07:00','23:30') ON CONFLICT ("restaurantId","dayOfWeek") DO NOTHING;
  END LOOP;
  FOR row IN SELECT * FROM (VALUES
    ('signature','Saxiixa Botan','Signature dishes from our kitchen',0),
    ('grill','Dabka & Grill','Freshly grilled, full of flavour',1),
    ('bowls','Bariis & Bowls','Comfort in every bowl',2),
    ('drinks','Cabitaanno','Fresh, bright and refreshing',3)
  ) AS categories(slug,name,description,sort_order) LOOP
    INSERT INTO "MenuCategory" (id,"restaurantId",slug,name,description,"sortOrder")
    VALUES (gen_random_uuid(),restaurant_id,row.slug,row.name,row.description,row.sort_order)
    ON CONFLICT ("restaurantId",slug) DO NOTHING;
  END LOOP;
  FOR row IN SELECT * FROM (VALUES
    ('bariis-hilib','Bariis & Hilib','Bariis udgoon, hilib ari oo jilicsan, moos iyo salad cusub.','signature',12.50,'/images/biryani.jpg',true,0),
    ('chicken-suqaar','Suqaar Digaag','Digaag la shiilay, khudaar cusub iyo xawaashka gaarka ah ee Botan.','signature',9.50,'/images/chicken.jpg',true,1),
    ('grilled-chicken','Digaag Dabka','Digaag la dubay oo leh liin, basbaas iyo maraq gaar ah.','grill',11.00,'/images/chicken.jpg',true,2),
    ('beef-burger','Botan Burger','Hilib lo’aad cusub, farmaajo, salad iyo suugo guriga lagu sameeyey.','grill',7.50,'/images/burger.jpg',true,3),
    ('salmon-bowl','Salmon Bowl','Kalluun la dubay, bariis, avocado iyo khudaar xilliyeed.','bowls',14.00,'/food-placeholder.svg',false,4),
    ('vegetable-bowl','Khudaar Bowl','Khudaar midabbo leh, chickpeas, bariis iyo tahini.','bowls',7.00,'/images/rice.jpg',true,5),
    ('fresh-mango','Cambaha Cusub','Casiir cambe dabiici ah oo qabow.','drinks',3.00,'/food-placeholder.svg',false,6),
    ('somali-shaah','Shaah Soomaali','Shaah caano leh, hayl, qorfe iyo dhadhan guriga.','drinks',2.00,'/food-placeholder.svg',false,7),
    ('pasta-bolognese','Baasto Hilib','Baasto cusub, suugo yaanyo iyo hilib shiidan.','signature',8.50,'/images/pasta.jpg',false,8),
    ('grilled-fish','Kalluun Dabka','Kalluun cusub oo badda, liin iyo khudaar la dubay.','grill',13.00,'/food-placeholder.svg',false,9)
  ) AS items(slug,name,description,category_slug,price,image_url,featured,sort_order) LOOP
    SELECT id INTO STRICT category_id FROM "MenuCategory" WHERE "restaurantId"=restaurant_id AND slug=row.category_slug;
    INSERT INTO "MenuItem" (id,"restaurantId","categoryId",slug,name,description,"basePrice","imageUrl","isFeatured","sortOrder","updatedAt")
    VALUES (gen_random_uuid(),restaurant_id,category_id,row.slug,row.name,row.description,row.price,row.image_url,row.featured,row.sort_order,now())
    ON CONFLICT ("restaurantId",slug) DO NOTHING;
  END LOOP;
  FOR row IN SELECT * FROM (VALUES ('Hodan',2.00,30),('Wadajir',2.50,35),('Waberi',2.00,30),('Hamar Weyne',3.00,40)) AS zones(name,fee,eta) LOOP
    INSERT INTO "DeliveryZone" (id,"restaurantId",name,"deliveryFee","etaMinutes")
    VALUES (gen_random_uuid(),restaurant_id,row.name,row.fee,row.eta) ON CONFLICT ("restaurantId",name) DO NOTHING;
  END LOOP;
  FOR n IN 1..8 LOOP
    INSERT INTO "DiningTable" (id,"restaurantId","tableNumber",capacity,"qrToken")
    VALUES (gen_random_uuid(),restaurant_id,n::text,CASE WHEN n<5 THEN 4 ELSE 6 END,gen_random_uuid()::text)
    ON CONFLICT ("restaurantId","tableNumber") DO NOTHING;
  END LOOP;
  INSERT INTO "Coupon" (id,"restaurantId",code,type,value,"minSpend","maxDiscount","usageLimit")
  VALUES (gen_random_uuid(),restaurant_id,'BOTAN10','PERCENTAGE',10,10,5,1000)
  ON CONFLICT ("restaurantId",code) DO NOTHING;
  INSERT INTO "InventoryItem" (id,"restaurantId",name,unit,"quantityOnHand","reorderLevel","averageUnitCost")
  VALUES (gen_random_uuid(),restaurant_id,'Burger patties','PIECE',100,15,2)
  ON CONFLICT ("restaurantId",name) DO NOTHING;
  SELECT id INTO STRICT stock_id FROM "InventoryItem" WHERE "restaurantId"=restaurant_id AND name='Burger patties';
  SELECT id INTO STRICT burger_id FROM "MenuItem" WHERE "restaurantId"=restaurant_id AND slug='beef-burger';
  INSERT INTO "RecipeIngredient" ("menuItemId","inventoryItemId",quantity) VALUES (burger_id,stock_id,1)
  ON CONFLICT ("menuItemId","inventoryItemId") DO NOTHING;
  SELECT id INTO modifier_id FROM "ModifierGroup" WHERE "restaurantId"=restaurant_id AND name='Ku dar' ORDER BY id LIMIT 1;
  IF modifier_id IS NULL THEN
    INSERT INTO "ModifierGroup" (id,"restaurantId",name,"minSelect","maxSelect")
    VALUES (gen_random_uuid(),restaurant_id,'Ku dar',0,2) RETURNING id INTO modifier_id;
  END IF;
  INSERT INTO "ModifierOption" (id,"groupId",name,"priceDelta")
  SELECT gen_random_uuid(),modifier_id,'Farmaajo dheeraad ah',1
  WHERE NOT EXISTS (SELECT 1 FROM "ModifierOption" WHERE "groupId"=modifier_id AND name='Farmaajo dheeraad ah');
  INSERT INTO "ModifierOption" (id,"groupId",name,"priceDelta")
  SELECT gen_random_uuid(),modifier_id,'Avocado',1.5
  WHERE NOT EXISTS (SELECT 1 FROM "ModifierOption" WHERE "groupId"=modifier_id AND name='Avocado');
  INSERT INTO "MenuItemModifierGroup" ("menuItemId","groupId") VALUES (burger_id,modifier_id)
  ON CONFLICT ("menuItemId","groupId") DO NOTHING;
END
$botan_seed$;
COMMIT;
SELECT 'Demo data ready' AS result, count(*) AS menu_items FROM public."MenuItem";
