alter table public.staff_profiles
  add column email_notifications_enabled boolean not null default true;

alter table public.staff_profiles
  add column in_browser_notifications_enabled boolean not null default true;

alter table public.customer_profiles
  add column email_notifications_enabled boolean not null default true;

alter table public.customer_profiles
  add column in_browser_notifications_enabled boolean not null default true;
