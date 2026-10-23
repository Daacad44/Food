# Supabase SQL Editor setup (no terminal required)

Run the following files in order in your project's **Supabase → SQL Editor → New query**. Open each file on GitHub, click **Raw**, copy its entire contents, paste into the SQL Editor, then click **Run**. Do not paste npm commands into the SQL Editor.

1. **`01-schema.sql`** creates the application tables, enum types, relations, indexes, SQL constraints and RLS. It records the exact committed Prisma migration checksums in `_prisma_migrations`, allowing future `prisma migrate deploy` runs to continue normally. Run the entire file at once; successful repeated runs skip already recorded migrations. Existing unmanaged or partially created application tables cause the transaction to roll back; do not drop those tables blindly. Unrelated public tables are preserved.
2. **`02-demo-data.sql`** adds the restaurant, opening hours, 10 sample dishes, 4 categories, 4 delivery zones, 8 tables, coupon, modifiers and burger inventory/recipe. Repeating it preserves existing prices, stock, settings and menu records.
3. **`03-admin.sql`** creates the staff owner. Before running it, replace `REPLACE_WITH_A_NEW_PASSWORD` with a NEW password of at least 12 characters (at most 72 UTF-8 bytes). Change `botan@gmail.com` if you want another email. The password is bcrypt-hashed inside PostgreSQL using pgcrypto; plaintext is never inserted into a table. A SQL single quote inside a value must be doubled: `''`. Run this edited query privately; do not post it in GitHub or chat. Existing owner passwords are preserved, not reset. If the email belongs to another role/restaurant, the script stops without changing that account.

If the SQL Editor asks to approve executing the schema script, it uses row-level security and table/constraint creation; it does not drop or truncate application data. Review the SQL before running it. Do not run this against an unrelated existing schema.

After all three scripts succeed:

- Open `/menu` on your Vercel site; sample dishes should appear.
- Open `/login?staff=1`, choose **Staff**, and enter the email and password chosen in `03-admin.sql`. These are custom application staff accounts, not Supabase Auth users.
- `DATABASE_URL` in Vercel must still point to this same Supabase project. SQL setup does not change Vercel environment variables. The application still requires `SESSION_SECRET` and its other runtime settings.
- This manual SQL route does not read `OWNER_EMAIL` or `OWNER_PASSWORD` from Vercel. Those variables are used only by the alternative npm seed route.
- Sample images are repository paths such as `/images/burger.jpg`; Supabase Storage upload is optional.

No Codespaces, npm commands or local server are needed for this SQL Editor workflow. Vercel continues to serve the app and Supabase stores its data. No real credentials are included in these public files.

## Maintainer verification

Regenerate `01-schema.sql` after adding a Prisma migration:

```sh
node --import tsx scripts/build-supabase-sql.ts
node --import tsx scripts/test-supabase-sql.ts
```

The test requires the local PostgreSQL server on `127.0.0.1:54329`. It recreates only the dedicated `botan_sql_check` database, exercises all three SQL files, checks repeatability/data preservation and bcrypt compatibility, runs Prisma migration deployment/schema diff, and completes a real API order workflow. It refuses hosted database resets.
