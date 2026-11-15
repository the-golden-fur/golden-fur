-- New role: Developer. A minimal, isolated engineering role - sees only the
-- Bug Reports/Feature Requests queue and its own Developer Dashboard (user
-- counts, deactivated accounts, etc.), nothing else a normal staff role can
-- reach. Standalone migration since `alter type ... add value` can't run
-- inside a transaction with other DDL (same pattern as
-- 20261008257_custom_staff_role_add_front_desk.sql).
alter type public.staff_role add value 'Developer';
