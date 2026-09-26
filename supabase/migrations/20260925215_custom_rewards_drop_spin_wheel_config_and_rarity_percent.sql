-- Custom change (session 114): removes what the promo + reward pool shape
-- fully replaced. spin_wheel_config's numbers now live per promo in
-- spin_wheel_promo_settings (copied into the "Loyalty Spin" promo by
-- 20260925213); rarity_percent is replaced by rarity_tier + weight
-- (20260925209). Nothing reads either after 20260925214.

drop table if exists public.spin_wheel_config;

alter table public.spin_wheel_rewards
  drop column if exists rarity_percent;
