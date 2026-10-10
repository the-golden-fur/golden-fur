-- New combined role: Front Desk gets the union of Receptionist's and
-- Cashier's access (see every role-array touched alongside this migration)
-- without changing either existing role. Standalone migration since
-- `alter type ... add value` can't run inside a transaction with other DDL.
alter type public.staff_role add value 'Front Desk';
