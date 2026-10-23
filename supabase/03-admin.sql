-- Run AFTER 01 and 02. Edit ONLY admin_email and admin_password below.
-- Use a NEW test password. This file contains no real password or database credential.
-- Run only in your private Supabase SQL Editor; do not publish the edited query.
BEGIN;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
SET LOCAL search_path = public, pg_catalog;
SELECT pg_advisory_xact_lock(hashtext('botan-sql-setup'));
DO $botan_admin$
DECLARE
  admin_email TEXT := 'botan@gmail.com';
  admin_password TEXT := 'REPLACE_WITH_A_NEW_PASSWORD';
  restaurant_id UUID;
  existing_user RECORD;
  crypto_schema TEXT;
  password_hash TEXT;
BEGIN
  IF admin_password LIKE 'REPLACE%' OR length(admin_password)<12 OR octet_length(admin_password)>72 THEN
    RAISE EXCEPTION 'Choose a NEW password with 12+ characters and at most 72 UTF-8 bytes in admin_password before running.';
  END IF;
  admin_email := lower(trim(admin_email));
  IF admin_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Enter a valid admin email'; END IF;
  SELECT id INTO STRICT restaurant_id FROM "Restaurant" WHERE slug='botan';
  SELECT * INTO existing_user FROM "StaffUser" WHERE email=admin_email;
  IF FOUND THEN
    IF existing_user."restaurantId" <> restaurant_id OR existing_user.role <> 'OWNER' THEN
      RAISE EXCEPTION 'Email belongs to another account. Existing account was not modified.';
    END IF;
    RAISE NOTICE 'Owner already exists. Password unchanged. Sign in using the existing password.';
    RETURN;
  END IF;
  SELECT ns.nspname INTO STRICT crypto_schema FROM pg_extension ext JOIN pg_namespace ns ON ns.oid=ext.extnamespace WHERE ext.extname='pgcrypto';
  EXECUTE format('SELECT %I.crypt($1, %I.gen_salt(''bf'', 12))',crypto_schema,crypto_schema) INTO password_hash USING admin_password;
  INSERT INTO "StaffUser" (id,"restaurantId","fullName",email,"passwordHash",role,status,"updatedAt")
  VALUES (gen_random_uuid(),restaurant_id,'Botan Owner',admin_email,password_hash,'OWNER','ACTIVE',now());
END
$botan_admin$;
COMMIT;
SELECT email, role, status FROM public."StaffUser" WHERE role='OWNER';
