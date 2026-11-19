-- Botan: Somali menu at $0.10 per item, free delivery.
-- Run AFTER 01-schema.sql (and the other setup files). Safe to run more than once.
-- Nothing is deleted: the previous categories are only switched off (isActive = false), so their
-- items disappear from the order screen but old orders and reports keep their history. To bring a
-- category back, set its "isActive" to true again in Menu settings or the table editor.
BEGIN;
SET LOCAL search_path = public, pg_catalog;
SELECT pg_advisory_xact_lock(hashtext('botan-sql-setup'));
DO $botan_somali_menu$
DECLARE
  restaurant_id UUID;
  category_id UUID;
  row RECORD;
  new_categories TEXT[] := ARRAY['quraac','qado','cunto-fudud','cabitaan'];
BEGIN
  SELECT id INTO restaurant_id FROM "Restaurant" WHERE slug = 'botan';
  IF restaurant_id IS NULL THEN
    SELECT id INTO STRICT restaurant_id FROM "Restaurant" ORDER BY "createdAt" LIMIT 1;
  END IF;

  -- 1. Switch off every category that is not part of the Somali menu.
  UPDATE "MenuCategory" SET "isActive" = false
  WHERE "restaurantId" = restaurant_id AND NOT (slug = ANY (new_categories));

  -- 2. Somali categories.
  FOR row IN SELECT * FROM (VALUES
    ('quraac','Quraac','Quraac Soomaaliyeed oo kulul',0),
    ('qado','Qado & Casho','Cunto kulul oo Soomaaliyeed',1),
    ('cunto-fudud','Cunto Fudud','Sambuusa, bajiye iyo macmacaan',2),
    ('cabitaan','Cabitaan','Shaah, qaxwo iyo casiir',3)
  ) AS c(slug,name,description,sort_order) LOOP
    INSERT INTO "MenuCategory" (id,"restaurantId",slug,name,description,"sortOrder","isActive")
    VALUES (gen_random_uuid(),restaurant_id,row.slug,row.name,row.description,row.sort_order,true)
    ON CONFLICT ("restaurantId",slug) DO UPDATE
      SET name = EXCLUDED.name, description = EXCLUDED.description,
          "sortOrder" = EXCLUDED."sortOrder", "isActive" = true;
  END LOOP;

  -- 3. Somali dishes, every one $0.10.
  FOR row IN SELECT * FROM (VALUES
    ('so-canjeero-suqaar','Canjeero iyo Suqaar','Canjeero cusub, suqaar hilib ari ah iyo shaah.','quraac','/food-placeholder.svg',true,0),
    ('so-laxoox-malab','Laxoox Malab iyo Subag','Laxoox kulul, malab iyo subag.','quraac','/food-placeholder.svg',false,1),
    ('so-muufo-beer','Muufo iyo Beer','Muufo foorno, beer la shiilay iyo basal.','quraac','/food-placeholder.svg',false,2),
    ('so-foul','Foul','Foul la kariyey, saliid, basal iyo rooti.','quraac','/food-placeholder.svg',false,3),
    ('so-malawax','Malawax','Malawax jilicsan, malab ama sonkor.','quraac','/food-placeholder.svg',false,4),
    ('so-bariis-hilib-ari','Bariis iyo Hilib Ari','Bariis Soomaali ah, hilib ari, moos iyo basbaas.','qado','/images/biryani.jpg',true,10),
    ('so-bariis-digaag','Bariis iyo Digaag','Bariis xawaash leh iyo digaag la dubay.','qado','/images/chicken.jpg',true,11),
    ('so-hilib-geel','Hilib Geel','Hilib geel la shiilay, bariis ama canjeero.','qado','/images/rice.jpg',true,12),
    ('so-baasto-suugo','Baasto iyo Suugo','Baasto, suugo hilib iyo moos.','qado','/images/pasta.jpg',true,13),
    ('so-soor-maraq','Soor iyo Maraq','Soor galley ah, maraq hilib iyo subag.','qado','/food-placeholder.svg',false,14),
    ('so-kalluun-bariis','Kalluun iyo Bariis','Kalluun badda oo la shiilay, bariis iyo liin.','qado','/images/rice.jpg',false,15),
    ('so-oodkac','Oodkac','Hilib qalalan oo subag iyo xawaash leh.','qado','/food-placeholder.svg',false,16),
    ('so-sambuusa','Sambuusa','Sambuusa hilib ah oo kulul (3 xabbo).','cunto-fudud','/food-placeholder.svg',true,20),
    ('so-bajiye','Bajiye','Bajiye digir ah iyo basbaas cagaar.','cunto-fudud','/food-placeholder.svg',false,21),
    ('so-kac-kac','Kac Kac','Kac kac macaan oo la shiilay.','cunto-fudud','/food-placeholder.svg',false,22),
    ('so-xalwo','Xalwo','Xalwo Soomaaliyeed oo hayl iyo subag leh.','cunto-fudud','/food-placeholder.svg',false,23),
    ('so-shaah','Shaah Soomaali','Shaah caano, hayl iyo qorfe.','cabitaan','/food-placeholder.svg',true,30),
    ('so-qaxwo','Qaxwo','Qaxwo Soomaaliyeed oo sinjibiil leh.','cabitaan','/food-placeholder.svg',false,31),
    ('so-caano-geel','Caano Geel','Caano geel cusub oo qabow.','cabitaan','/food-placeholder.svg',false,32),
    ('so-casiir-cambe','Casiir Cambe','Casiir cambe dabiici ah.','cabitaan','/food-placeholder.svg',false,33),
    ('so-casiir-liin','Casiir Liin','Liin cusub, sonkor iyo baraf.','cabitaan','/food-placeholder.svg',false,34)
  ) AS i(slug,name,description,category_slug,image_url,featured,sort_order) LOOP
    SELECT id INTO STRICT category_id FROM "MenuCategory"
    WHERE "restaurantId" = restaurant_id AND slug = row.category_slug;
    INSERT INTO "MenuItem" (id,"restaurantId","categoryId",slug,name,description,"basePrice","imageUrl","isFeatured","isAvailable","sortOrder","updatedAt")
    VALUES (gen_random_uuid(),restaurant_id,category_id,row.slug,row.name,row.description,0.10,row.image_url,row.featured,true,row.sort_order,now())
    ON CONFLICT ("restaurantId",slug) DO UPDATE
      SET "categoryId" = EXCLUDED."categoryId", name = EXCLUDED.name, description = EXCLUDED.description,
          "basePrice" = 0.10, "isAvailable" = true, "updatedAt" = now();
  END LOOP;

  -- 4. Free delivery in every zone.
  UPDATE "DeliveryZone" SET "deliveryFee" = 0 WHERE "restaurantId" = restaurant_id;
END
$botan_somali_menu$;
COMMIT;

-- Optional: VAT is 5% by default, so a $0.10 item totals $0.11. To charge exactly $0.10, run:
-- UPDATE "RestaurantSettings" SET "taxRate" = 0;
