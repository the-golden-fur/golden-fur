-- Custom change (session 114): the coupon spin wheel becomes a promo TYPE
-- instead of a standalone settings page - "Add New Promo > Coupon Spin
-- Wheel" in the existing promo builder wizard.
--
-- Its own file, same as 20260913201: a value added by ALTER TYPE ... ADD
-- VALUE can't be referenced (CHECKs, inserts, comparisons) until the
-- transaction that added it has committed, and the follow-up migrations in
-- this session all reference 'spin_wheel'.

alter type public.promo_type add value if not exists 'spin_wheel';
