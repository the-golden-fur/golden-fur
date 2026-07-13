-- Golden Fur local/remote seed data.
-- Runs after all migrations on `supabase db reset` (see supabase/config.toml
-- [db.seed] sql_paths). Rewritten because the previous version inserted a
-- `break_window` value into public.branches, a column dropped by migration
-- 20260701010 — that made every `db reset` fail on a fresh apply.
--
-- All accounts use the password: password123
-- Staff:    <branch>.<role>N@goldenfur.com  (e.g. makati.admin2@goldenfur.com)
-- Customer: customerN@goldenfur.com

-- ============================================================
-- Branches
-- ============================================================

insert into public.branches (
  name,
  address,
  contact_number,
  is_vet_branch,
  operating_hours,
  timezone
)
values
  (
    'Makati',
    'Makati City, Philippines',
    '+63 2 8888 0001',
    true,
    '{"monday":{"open":"08:00","close":"18:00"},"tuesday":{"open":"08:00","close":"18:00"},"wednesday":{"open":"08:00","close":"18:00"},"thursday":{"open":"08:00","close":"18:00"},"friday":{"open":"08:00","close":"18:00"},"saturday":{"open":"09:00","close":"15:00"},"sunday":{"open":"10:00","close":"14:00"}}'::jsonb,
    'Asia/Manila'
  ),
  (
    'Southwoods',
    'Southwoods City, Philippines',
    '+63 46 8888 0002',
    false,
    '{"monday":{"open":"08:00","close":"17:00"},"tuesday":{"open":"08:00","close":"17:00"},"wednesday":{"open":"08:00","close":"17:00"},"thursday":{"open":"08:00","close":"17:00"},"friday":{"open":"08:00","close":"17:00"},"saturday":{"open":"09:00","close":"14:00"},"sunday":{"open":"10:00","close":"13:00"}}'::jsonb,
    'Asia/Manila'
  );

-- ============================================================
-- Staff: 2 accounts per role per branch
-- (branch.roleN@goldenfur.com, e.g. makati.admin2@goldenfur.com)
-- ============================================================

do $$
declare
  v_branch record;
  v_roles public.staff_role[] := array[
    'Superadmin', 'Admin', 'Supervisor', 'Receptionist',
    'Groomer', 'Veterinarian', 'Cashier', 'Pet Assistant'
  ]::public.staff_role[];
  v_role_slugs text[] := array[
    'superadmin', 'admin', 'supervisor', 'receptionist',
    'groomer', 'veterinarian', 'cashier', 'petassistant'
  ];
  v_branch_slug text;
  v_role_idx int;
  v_n int;
  v_user_id uuid;
  v_email text;
  v_username text;
  v_display_name text;
begin
  for v_branch in select id, name from public.branches order by name loop
    v_branch_slug := lower(v_branch.name);

    for v_role_idx in 1 .. array_length(v_roles, 1) loop
      for v_n in 1 .. 2 loop
        v_email := v_branch_slug || '.' || v_role_slugs[v_role_idx] || v_n || '@goldenfur.com';
        v_username := v_branch_slug || '.' || v_role_slugs[v_role_idx] || v_n;
        v_display_name := v_branch.name || ' ' || v_roles[v_role_idx] || ' ' || v_n;
        v_user_id := gen_random_uuid();

        insert into auth.users (
          id, instance_id, aud, role, email, encrypted_password,
          email_confirmed_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
          created_at, updated_at,
          confirmation_token, recovery_token, email_change_token_new, email_change
        )
        values (
          v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          v_email, crypt('password123', gen_salt('bf')),
          now(), now(),
          '{"provider":"email","providers":["email"]}'::jsonb,
          format('{"full_name":"%s"}', v_display_name)::jsonb,
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

        insert into public.staff_profiles (
          id, branch_id, role, username, registered_email, display_name, is_active
        )
        values (
          v_user_id, v_branch.id, v_roles[v_role_idx], v_username, v_email, v_display_name, true
        );
      end loop;
    end loop;
  end loop;
end $$;

-- ============================================================
-- Customers: customer1@goldenfur.com .. customer5@goldenfur.com
-- ============================================================

do $$
declare
  v_n int;
  v_user_id uuid;
  v_email text;
  v_full_name text;
begin
  for v_n in 1 .. 5 loop
    v_email := 'customer' || v_n || '@goldenfur.com';
    v_full_name := 'Customer ' || v_n;
    v_user_id := gen_random_uuid();

    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    )
    values (
      v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      v_email, crypt('password123', gen_salt('bf')),
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
      id, full_name, contact_number, account_email, primary_auth_provider
    )
    values (
      v_user_id, v_full_name, '+63 917 000 ' || lpad(v_n::text, 4, '0'), v_email, 'email'
    );
  end loop;
end $$;
