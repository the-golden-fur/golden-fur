-- Custom change (package extras): a package's contents could only be picked
-- from the service catalog, and every service there is also bookable on its
-- own. A package can now also carry named extras - things that are NOT
-- individual services, typed in by name in Config > Packages (e.g. "Free
-- bandana", "Cologne spritz").
--
-- An extra is just a name on that one package: no price and no duration, so
-- it changes neither the package's derived price nor its appointment length.
-- That is why it is a text[] on packages rather than a row in services or a
-- table of its own - there is nothing else to store, and nothing to share
-- between packages.
--
-- Order is kept (the order they were added). No new table, so no new RLS
-- policy or archive trigger: the table's existing policies cover the row.

alter table public.packages
  add column extras text[] not null default '{}'
    constraint packages_extras_max_count
      check (coalesce(array_length(extras, 1), 0) <= 20);

comment on column public.packages.extras is
  'Named inclusions that are not individual services (e.g. "Free bandana") - names only, no price or duration, in the order they were added. Shown with the package''s contents wherever those are listed.';
