-- Boarding Checklist (rename of Hotel Care Log, merged Hotel+Daycare): the
-- most important group-by is "time of day" (the Morning/Noon/Afternoon/
-- Evening block set on the originating care instruction), but that value
-- was only ever baked into care_log_entries.description as free text (e.g.
-- "Morning meal — 1 cup kibble") - not a real, queryable/groupable column.
-- Adds one nullable text column, backfilled for existing rows by parsing
-- the leading word off description (best-effort; new rows are populated
-- properly at generation time going forward - see generateCareLogEntries
-- in careInstructions.service.ts).

alter table public.care_log_entries
  add column time_block text
    check (time_block in ('Morning', 'Noon', 'Afternoon', 'Evening'));

update public.care_log_entries
set time_block = case
  when description ilike 'Morning %' then 'Morning'
  when description ilike 'Noon %' then 'Noon'
  when description ilike 'Afternoon %' then 'Afternoon'
  when description ilike 'Evening %' then 'Evening'
  else null
end
where time_block is null;
