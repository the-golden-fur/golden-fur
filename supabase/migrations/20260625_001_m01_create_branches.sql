create extension if not exists pgcrypto with schema extensions;

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  address text not null,
  contact_number text,
  is_vet_branch boolean not null default false,
  operating_hours jsonb not null default '{}'::jsonb,
  timezone text not null default 'Asia/Manila',
  break_window jsonb,
  created_at timestamptz not null default now()
);
