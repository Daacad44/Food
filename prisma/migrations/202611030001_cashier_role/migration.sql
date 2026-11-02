-- The order taker is called a cashier again, with full authority over orders
-- (take, assign riders, payments, delivery, cancel, refund). Existing order takers keep their access.
ALTER TYPE "StaffRole" RENAME VALUE 'OPERATOR' TO 'CASHIER';
