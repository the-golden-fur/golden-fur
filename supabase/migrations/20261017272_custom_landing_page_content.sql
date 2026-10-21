-- Custom change (editable landing page): every word, image and section of
-- the public landing page was hardcoded in LandingPage.tsx. They now live
-- here so a Superadmin can edit them (Settings > Config > Landing Page) and
-- the landing page shows whatever is set.
--
-- Three tables, same style as faq_items (20261006246):
--
-- - landing_content: one row per editable slot. kind = 'text' rows always
--   hold text; kind = 'image' rows hold a 'landing-images' Storage public URL,
--   or null for "use the image bundled with the app". The set of keys is
--   fixed by this migration - the server only updates keys that exist here.
-- - landing_sections: whether each page section is shown.
-- - landing_reviews: the "Loved by pet parents" customer reviews.
--
-- One global copy - the landing page is the same for every branch, so there
-- is no branch_id. Branch names, addresses and hours on the landing page come
-- from public.branches itself (GET /public/branches), not from here.
--
-- RLS on with no policies, like faq_items: nothing reads or writes these
-- through the browser's Supabase client. GET /public/landing (no login) and
-- the Superadmin-only /maintenance/landing endpoints both go through the
-- Express server's service-role client (server/src/features/landing).

create table public.landing_content (
  key text primary key check (key ~ '^[a-z0-9_.]{1,80}$'),
  kind text not null check (kind in ('text', 'image')),
  value text,
  updated_at timestamptz not null default now(),
  check (
    (kind = 'text'
      and value is not null
      and char_length(btrim(value)) between 1 and 2000)
    or (kind = 'image'
      and (value is null or char_length(value) <= 2048))
  )
);

alter table public.landing_content enable row level security;

create table public.landing_sections (
  key text primary key
    check (key in ('hero', 'services', 'features', 'reviews', 'story', 'visit', 'cta')),
  is_visible boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.landing_sections enable row level security;

create table public.landing_reviews (
  id uuid primary key default gen_random_uuid(),
  quote text not null check (char_length(btrim(quote)) between 1 and 600),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  detail text not null default '' check (char_length(detail) <= 80),
  rating integer not null check (rating between 1 and 5),
  sort_order integer not null check (sort_order >= 1),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index landing_reviews_sort_order_idx on public.landing_reviews (sort_order);

-- Universal deleted-records archive (20260913202): a deleted review can be
-- restored from there.
create trigger trg_archive_deleted_row
  after delete on public.landing_reviews
  for each row execute function public.archive_deleted_row();

alter table public.landing_reviews enable row level security;

-- Public read (the landing page shows these to logged-out visitors); writes
-- only go through the Superadmin-only server routes with the service role.
-- Same bucket setup as 'avatars' (20260921206) and 'pet-photos'
-- (20261017271).
insert into storage.buckets (id, name, public)
values ('landing-images', 'landing-images', true)
on conflict (id) do nothing;

insert into public.landing_sections (key) values
  ('hero'),
  ('services'),
  ('features'),
  ('reviews'),
  ('story'),
  ('visit'),
  ('cta');

-- What LandingPage.tsx showed before this change, word for word, so nothing
-- changes for visitors until a Superadmin edits it. Image slots start null =
-- the bundled image.
insert into public.landing_content (key, kind, value) values
  -- Hero
  ('hero.eyebrow', 'text', 'Grooming · Veterinary · Day Care · Pet Hotel'),
  ('hero.title_lead', 'text', 'Care as warm as'),
  ('hero.title_brand', 'text', 'Golden Fur'),
  ('hero.lead', 'text', 'Compassionate, expert care for your beloved companions — because every tail wag, purr, and nuzzle deserves the very best.'),
  ('hero.primary_cta', 'text', 'Book an appointment'),
  ('hero.secondary_cta', 'text', 'Explore our services'),
  ('hero.image', 'image', null),
  ('hero.image_alt', 'text', 'The Golden Fur shop sign on a white brick wall beside shelves of pet care products'),

  -- What we Offer (one card per service category a branch offers)
  ('services.title', 'text', 'What we Offer'),
  ('services.grooming.name', 'text', 'Grooming'),
  ('services.grooming.description', 'text', 'Gentle bathing, coat trimming, nail clipping, ear cleaning, and styling to keep your pet clean, healthy, and comfortable.'),
  ('services.grooming.image', 'image', null),
  ('services.veterinary.name', 'text', 'Veterinary'),
  ('services.veterinary.description', 'text', 'Comprehensive checkups, diagnostics, vaccinations, treatment plans, and expert medical care tailored to your pet’s needs.'),
  ('services.veterinary.image', 'image', null),
  ('services.daycare.name', 'text', 'Day Care'),
  ('services.daycare.description', 'text', 'Safe, supervised daytime care with social play, feeding support, and rest time for pets while you’re away.'),
  ('services.daycare.image', 'image', null),
  ('services.hotel.name', 'text', 'Pet Hotel'),
  ('services.hotel.description', 'text', 'Comfortable overnight boarding with attentive staff, clean suites, routine care, and regular wellness monitoring.'),
  ('services.hotel.image', 'image', null),

  -- Service highlight cards
  ('features.grooming.title', 'text', 'Premium Grooming'),
  ('features.grooming.summary', 'text', 'Gentle coat care, trim styling, and wellness-focused grooming sessions.'),
  ('features.grooming.detail', 'text', 'Includes breed-specific coat treatments, de-shedding options, nail and paw care, and a calming bath routine handled by certified groomers.'),
  ('features.grooming.image', 'image', null),
  ('features.veterinary.title', 'text', 'Veterinary Consults'),
  ('features.veterinary.summary', 'text', 'Routine checkups and preventive care for healthier, happier pets.'),
  ('features.veterinary.detail', 'text', 'Vaccinations, deworming, diagnostics, and personalized treatment plans from licensed veterinarians who track your pet’s health over time.'),
  ('features.veterinary.image', 'image', null),
  ('features.daycare.title', 'text', 'Trusted Day Care'),
  ('features.daycare.summary', 'text', 'Safe supervised play and rest while you’re away for the day.'),
  ('features.daycare.detail', 'text', 'Group play matched to temperament and size, scheduled rest breaks, and feeding on your pet’s usual routine, all under attentive staff supervision.'),
  ('features.daycare.image', 'image', null),
  ('features.hotel.title', 'text', 'Comfort Pet Hotel'),
  ('features.hotel.summary', 'text', 'Clean cozy overnight boarding with attentive and loving support.'),
  ('features.hotel.detail', 'text', 'Private suites, regular wellness checks, comfortable bedding, and daily updates so you can travel with peace of mind.'),
  ('features.hotel.image', 'image', null),

  -- Reviews (the reviews themselves are landing_reviews rows)
  ('reviews.title', 'text', 'Loved by pet parents'),
  ('reviews.subtitle', 'text', 'Real words from families across our Makati and Southwoods branches.'),

  -- Guided care journey
  ('story.1.title', 'text', 'Warm, attentive intake'),
  ('story.1.body', 'text', 'We begin with a calm assessment so your pet feels safe while we understand history, behavior, and immediate needs.'),
  ('story.1.image', 'image', null),
  ('story.2.title', 'text', 'Customized care mapping'),
  ('story.2.body', 'text', 'Our team maps a tailored service path—from grooming to veterinary support—based on breed, age, and condition.'),
  ('story.2.image', 'image', null),
  ('story.3.title', 'text', 'Precise, gentle execution'),
  ('story.3.body', 'text', 'Every treatment is delivered with careful handling, clear updates, and quality checks at each milestone.'),
  ('story.3.image', 'image', null),
  ('story.4.title', 'text', 'Ongoing wellness continuity'),
  ('story.4.body', 'text', 'After the visit, we guide next steps and preventive routines to keep your companion healthy between appointments.'),
  ('story.4.image', 'image', null),

  -- Visit us (the branch cards come from public.branches)
  ('visit.title', 'text', 'Visit us'),
  ('visit.subtitle', 'text', 'Drop by either branch — walk-ins are welcome, appointments recommended.'),

  -- Closing call to action
  ('cta.title', 'text', 'Your pet’s next visit starts here'),
  ('cta.text', 'text', 'Book online in minutes for grooming, veterinary, day care, and boarding — at our Makati and Southwoods branches.'),
  ('cta.primary_button', 'text', 'Book an appointment'),
  ('cta.secondary_button', 'text', 'Find a branch'),

  -- Footer (always shown)
  ('footer.tagline', 'text', 'Compassionate, expert pet care across grooming, veterinary, day care, and boarding — because every pet deserves the best.'),
  ('footer.phone', 'text', '+63 2 0000 0000'),
  ('footer.email', 'text', 'hello@goldenfur.ph');

insert into public.landing_reviews (quote, name, detail, rating, sort_order) values
  ('Rio used to come home from other groomers anxious and shaking. Here he practically drags me to the door. The team clearly loves what they do.', 'Andrea Salcedo', 'Grooming · Makati', 5, 1),
  ('Our senior cat needed bloodwork and a dental. The vet walked us through every option without rushing, and we even got a follow-up call the next day.', 'Miguel Tan', 'Veterinary · Makati', 5, 2),
  ('Booked the pet hotel for a week-long trip. The daily photo updates meant I actually relaxed on vacation — Buddy came back happy and calm.', 'Kristine Reyes', 'Pet Hotel · Southwoods', 5, 3),
  ('Day care has been a lifesaver on long workdays. Nala gets her play and naps on schedule, and pickup is always quick and friendly.', 'Paolo Mendoza', 'Day Care · Makati', 5, 4),
  ('Switched both dogs here after one visit. Clean, always on time, and they remember the little things — like which one is terrified of the dryer.', 'Camille Ong', 'Grooming · Southwoods', 5, 5);
