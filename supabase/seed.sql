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
