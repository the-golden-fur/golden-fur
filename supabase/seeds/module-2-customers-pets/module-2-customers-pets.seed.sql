-- M02 Customer Portal & Pet Management - Sprint 1 reference seed data
-- (Issue #38).
--
-- Pure-SQL alternative to module-2-customers-pets.seed.ts, for when you'd
-- rather paste this into the Supabase SQL Editor / run it via psql than a
-- Node script. The customer block below is the original dev-convenience
-- seed content (previously supabase/seed.sql), moved here as part of
-- grouping seeds by module - with one addition: customer1 now also gets a
-- placeholder facebook_id (the original predates the M02 OAuth
-- account-merge path), and a pets block was appended since `pets` didn't
-- exist yet when the original was written.
--
-- Runs automatically on `supabase db reset` (see supabase/config.toml
-- [db.seed] sql_paths). Not idempotent by design - like the original, this
-- is meant to run once against a freshly-reset database, not re-run against
-- one that already has these rows (re-running will hit the unique
-- constraint on customer_profiles.account_email). If you need a version
-- that's safe to re-run against a live database, use
-- module-2-customers-pets.seed.ts instead.
--
-- All accounts use the password: password123
-- Customer: customerN@goldenfur.com
--
-- crypt()/gen_salt() are schema-qualified as extensions.crypt()/
-- extensions.gen_salt() because migration 20260625001 installs pgcrypto
-- `with schema extensions`, not into `public`. Unqualified calls resolve
-- fine against a local `supabase start` instance (whose default
-- search_path happens to include `extensions`) but fail against a linked
-- remote project's reset/seed session with
-- `function gen_salt(unknown) does not exist` - always schema-qualify here.

-- ============================================================
-- Customers: customer1@goldenfur.com .. customer5@goldenfur.com
-- ============================================================

do $$
declare
  v_n int;
  v_user_id uuid;
  v_email text;
  v_full_name text;
  v_facebook_id text;
begin
  for v_n in 1 .. 5 loop
    v_email := 'customer' || v_n || '@goldenfur.com';
    v_full_name := 'Customer ' || v_n;
    v_user_id := gen_random_uuid();
    -- customer1 carries a stand-in facebook_id so the M02 OAuth
    -- account-merge path can be exercised manually without a live Facebook
    -- consent flow.
    v_facebook_id := case when v_n = 1 then 'seed-facebook-id-customer1' else null end;

    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    )
    values (
      v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      v_email, extensions.crypt('password123', extensions.gen_salt('bf')),
      now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      format('{"full_name":"%s"}', v_full_name)::jsonb,
      now(), now(),
      '', '', '', ''
    );

    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    )
    values (
      gen_random_uuid(), v_user_id::text, v_user_id,
      format('{"sub":"%s","email":"%s"}', v_user_id, v_email)::jsonb,
      'email', now(), now(), now()
    );

    insert into public.customer_profiles (
      id, full_name, contact_number, account_email, primary_auth_provider, facebook_id
    )
    values (
      v_user_id, v_full_name, '+63 917 000 ' || lpad(v_n::text, 4, '0'), v_email, 'email', v_facebook_id
    );
  end loop;
end $$;

-- ============================================================
-- Pets: 2-3 per customer, varied pet_type/weight_class/coat_type, and a
-- realistic mix of assessed vs. unassessed (client interview finding -
-- weight_class/coat_type are staff-only, set onsite - see
-- ...073_m02_pets_assessment_lock.sql). Each customer gets at least one
-- already-assessed pet (weight_class/coat_type/assessed_by/assessed_at all
-- set, assessed_at varied per pet via assessed_days_ago so "last assessed
-- X ago" isn't identical across the board) and one freshly-added,
-- never-assessed pet (weight_class/coat_type/assessed_by/assessed_at all
-- NULL - no assessed_days_ago key at all).
-- ============================================================

do $$
declare
  v_customer record;
  v_pet jsonb;
  v_assessor_id uuid;
  v_pets_by_email jsonb := '{
    "customer1@goldenfur.com": [
      {"name": "Max", "pet_type": "Dog", "weight_class": "M", "coat_type": "SC", "assessed_days_ago": 45},
      {"name": "Luna", "pet_type": "Cat", "weight_class": "S", "coat_type": "LC", "assessed_days_ago": 10},
      {"name": "Cooper", "pet_type": "Dog"}
    ],
    "customer2@goldenfur.com": [
      {"name": "Rex", "pet_type": "Dog", "weight_class": "L", "coat_type": "LC", "assessed_days_ago": 90},
      {"name": "Whiskers", "pet_type": "Cat"}
    ],
    "customer3@goldenfur.com": [
      {"name": "Bruno", "pet_type": "Dog", "weight_class": "XL", "coat_type": "SC", "assessed_days_ago": 200},
      {"name": "Mimi", "pet_type": "Cat", "weight_class": "M", "coat_type": "LC", "assessed_days_ago": 5},
      {"name": "Nala", "pet_type": "Cat"}
    ],
    "customer4@goldenfur.com": [
      {"name": "Coco", "pet_type": "Cat", "weight_class": "L", "coat_type": "SC", "assessed_days_ago": 400},
      {"name": "Buddy", "pet_type": "Dog"}
    ],
    "customer5@goldenfur.com": [
      {"name": "Bella", "pet_type": "Dog", "weight_class": "S", "coat_type": "LC", "assessed_days_ago": 20},
      {"name": "Simba", "pet_type": "Cat", "weight_class": "XL", "coat_type": "SC", "assessed_days_ago": 60},
      {"name": "Milo", "pet_type": "Cat"}
    ]
  }'::jsonb;
begin
  -- Whoever assessed these seed pets - any seeded Receptionist works, this
  -- is display-only (assessed_by isn't currently shown anywhere - see
  -- ...19-pet-assessment-gate's follow-up doc).
  select id into v_assessor_id from public.staff_profiles where role = 'Receptionist' limit 1;

  if v_assessor_id is null then
    raise notice 'module-2 pet seed: no Receptionist found in staff_profiles - seeded "assessed" pets will have assessed_by = NULL (has module-1''s seed run first?)';
  end if;

  for v_customer in
    select id, account_email from public.customer_profiles where account_email like 'customer%@goldenfur.com'
  loop
    for v_pet in select * from jsonb_array_elements(v_pets_by_email -> v_customer.account_email)
    loop
      -- breed_id intentionally left NULL (nullable per Issue #71) - none of
      -- these seed rows need a specific seeded breed.
      insert into public.pets (
        customer_id, name, pet_type, weight_class, coat_type, assessed_by, assessed_at
      )
      values (
        v_customer.id,
        v_pet ->> 'name',
        (v_pet ->> 'pet_type')::public.pet_type,
        (v_pet ->> 'weight_class')::public.pet_weight_class,
        (v_pet ->> 'coat_type')::public.pet_coat_type,
        case when v_pet ? 'assessed_days_ago' then v_assessor_id else null end,
        case
          when v_pet ? 'assessed_days_ago'
          then now() - ((v_pet ->> 'assessed_days_ago') || ' days')::interval
          else null
        end
      );
    end loop;
  end loop;
end $$;
