ALTER TABLE "MenuItem" ADD CONSTRAINT "menu_price_nonnegative" CHECK ("basePrice" >= 0);
ALTER TABLE "OrderItem" ADD CONSTRAINT "order_item_positive" CHECK ("quantity" > 0 AND "unitPrice" >= 0 AND "lineTotal" >= 0);
ALTER TABLE "Order" ADD CONSTRAINT "order_totals_valid" CHECK ("subtotal" >= 0 AND "discountAmount" >= 0 AND "discountAmount" <= "subtotal" AND "taxAmount" >= 0 AND "deliveryFee" >= 0 AND "total" = "subtotal" - "discountAmount" + "taxAmount" + "deliveryFee");
ALTER TABLE "ModifierGroup" ADD CONSTRAINT "modifier_selection_valid" CHECK ("minSelect" >= 0 AND "maxSelect" >= "minSelect");
ALTER TABLE "Review" ADD CONSTRAINT "rating_valid" CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "InventoryItem" ADD CONSTRAINT "inventory_nonnegative" CHECK ("quantityOnHand" >= 0 AND "averageUnitCost" >= 0 AND "reorderLevel" >= 0);
ALTER TABLE "Payment" ADD CONSTRAINT "payment_nonnegative" CHECK ("amount" >= 0);
ALTER TABLE "Refund" ADD CONSTRAINT "refund_positive" CHECK ("amount" > 0);
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "recipe_positive" CHECK ("quantity" > 0);
ALTER TABLE "PurchaseLine" ADD CONSTRAINT "purchase_line_positive" CHECK ("quantity" > 0 AND "unitCost" >= 0 AND "lineTotal" >= 0);
ALTER TABLE "Coupon" ADD CONSTRAINT "coupon_valid" CHECK ("value" >= 0 AND ("type" != 'PERCENTAGE' OR "value" <= 100) AND "usedCount" >= 0 AND ("usageLimit" IS NULL OR "usageLimit" >= "usedCount"));
ALTER TABLE "OpeningHour" ADD CONSTRAINT "hours_valid" CHECK ("dayOfWeek" BETWEEN 0 AND 6 AND "opensAt" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "closesAt" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
CREATE UNIQUE INDEX "one_open_shift_per_cashier" ON "CashierShift" ("cashierId") WHERE "status" = 'OPEN';

-- API owns access; browser clients never query these tables directly.
-- RLS protects Supabase Data API access. The server connection uses the database owner.
DO $$ DECLARE t record; BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
