alter table public.staff_profiles
  add column theme_preference text not null default 'system'
    constraint staff_profiles_theme_preference_check
    check (theme_preference in ('light', 'dark', 'system'));

alter table public.customer_profiles
  add column theme_preference text not null default 'system'
    constraint customer_profiles_theme_preference_check
    check (theme_preference in ('light', 'dark', 'system'));
