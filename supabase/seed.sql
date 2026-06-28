insert into public.branches (
  name,
  address,
  contact_number,
  is_vet_branch,
  operating_hours,
  timezone,
  break_window
)
values
  (
    'Makati',
    'Makati City, Philippines',
    '+63 2 8888 0001',
    true,
    '{"monday":{"open":"08:00","close":"18:00"},"tuesday":{"open":"08:00","close":"18:00"},"wednesday":{"open":"08:00","close":"18:00"},"thursday":{"open":"08:00","close":"18:00"},"friday":{"open":"08:00","close":"18:00"},"saturday":{"open":"09:00","close":"15:00"},"sunday":{"open":"10:00","close":"14:00"}}'::jsonb,
    'Asia/Manila',
    null
  ),
  (
    'Southwoods',
    'Southwoods City, Philippines',
    '+63 46 8888 0002',
    false,
    '{"monday":{"open":"08:00","close":"17:00"},"tuesday":{"open":"08:00","close":"17:00"},"wednesday":{"open":"08:00","close":"17:00"},"thursday":{"open":"08:00","close":"17:00"},"friday":{"open":"08:00","close":"17:00"},"saturday":{"open":"09:00","close":"14:00"},"sunday":{"open":"10:00","close":"13:00"}}'::jsonb,
    'Asia/Manila',
    null
  );

-- Seed Auth Users for Customers
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, last_sign_in_at, app_metadata, user_metadata, created_at, updated_at)
VALUES
('b0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'customer1@example.com', crypt('password123', gen_salt('bf')), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Alice Customer"}', now(), now()),
('b0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'customer2@example.com', crypt('password123', gen_salt('bf')), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Bob Customer"}', now(), now());

INSERT INTO auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES
(gen_random_uuid(), 'b0000000-0000-0000-0000-000000000001', format('{"sub":"%s","email":"%s"}', 'b0000000-0000-0000-0000-000000000001', 'customer1@example.com')::jsonb, 'email', now(), now(), now()),
(gen_random_uuid(), 'b0000000-0000-0000-0000-000000000002', format('{"sub":"%s","email":"%s"}', 'b0000000-0000-0000-0000-000000000002', 'customer2@example.com')::jsonb, 'email', now(), now(), now());

-- Seed Customer Profiles
INSERT INTO public.customer_profiles (id, full_name, contact_number, account_email, primary_auth_provider)
VALUES
('b0000000-0000-0000-0000-000000000001', 'Alice Customer', '+63 917 000 0001', 'customer1@example.com', 'email'),
('b0000000-0000-0000-0000-000000000002', 'Bob Customer', '+63 917 000 0002', 'customer2@example.com', 'email');
