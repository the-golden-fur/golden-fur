alter table public.staff_profiles
  add column font_size_preference text not null default 'medium'
    constraint staff_profiles_font_size_preference_check
    check (font_size_preference in ('small', 'medium', 'large', 'x-large'));

alter table public.customer_profiles
  add column font_size_preference text not null default 'medium'
    constraint customer_profiles_font_size_preference_check
    check (font_size_preference in ('small', 'medium', 'large', 'x-large'));
