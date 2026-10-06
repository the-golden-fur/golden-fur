-- Custom change (configurable mascot FAQs): the help mascot's "Frequently
-- asked questions" popup was six questions hardcoded in HelpMascot.tsx. They
-- now live here so a Superadmin can add, edit, reorder, hide and delete them
-- (Settings > Config > Mascot FAQs) and the mascot shows whatever is set.
--
-- One global list - the mascot is the same on every page and for every
-- branch, so there is no branch_id.
--
-- sort_order is the position in the popup, lowest first. is_active = false
-- hides an FAQ from the popup while keeping it in the settings screen.

create table public.faq_items (
  id uuid primary key default gen_random_uuid(),
  question text not null check (char_length(btrim(question)) between 1 and 200),
  answer text not null check (char_length(btrim(answer)) between 1 and 2000),
  sort_order integer not null check (sort_order >= 1),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index faq_items_sort_order_idx on public.faq_items (sort_order);

-- Universal deleted-records archive (20260913202): a deleted FAQ can be
-- restored from there.
create trigger trg_archive_deleted_row
  after delete on public.faq_items
  for each row execute function public.archive_deleted_row();

-- RLS on with no policies: nothing reads or writes this table through the
-- browser's Supabase client. Both paths go through the Express server's
-- service-role client (server/src/features/faq) - GET /public/faqs for the
-- mascot, which a logged-out visitor can reach, and the Superadmin-only
-- /maintenance/faqs endpoints for editing.
alter table public.faq_items enable row level security;

-- The six questions the mascot showed before this change, word for word, so
-- nothing changes for visitors until a Superadmin edits them.
insert into public.faq_items (question, answer, sort_order) values
  (
    'How do I book a service?',
    'Head to "Book a Service" from your portal sidebar (or the landing page navbar if you''re not logged in yet), pick a branch, service, and time slot, then confirm.',
    1
  ),
  (
    'Can I cancel or reschedule a booking?',
    'Yes - open the booking from "My Bookings" and use the cancel/reschedule option there. Cancellation windows vary by service, so check the booking details for the exact cutoff.',
    2
  ),
  (
    'What branches does Golden Fur have?',
    'We currently operate in Makati and Southwoods, Laguna. See the Branches page for addresses and directions to each.',
    3
  ),
  (
    'How do credits and packages work?',
    'Bundled packages and promos are listed on the Packages & Promos page. Any credit balance from a package or refund shows on your portal home, broken down by branch.',
    4
  ),
  (
    'How do I update my pet’s profile or medical records?',
    'Go to "Pet Manager" in your sidebar, select a pet, and edit their profile, food/medication, and health notes from there.',
    5
  ),
  (
    'Still need help?',
    'Use "Contact support" or "Create a ticket" from this same menu, and our team will follow up with you directly.',
    6
  );
