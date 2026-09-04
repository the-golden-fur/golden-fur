-- code-reviewer catch (pre-PR): 20260904169 (drop+create get_staff_availability
-- under its new p_roles staff_role[] signature) forgot to re-apply the
-- revoke/grant pair originally set on the function in 20260718036 (locking
-- it down to authenticated/service_role only, no anon/PUBLIC execute).
-- DROP FUNCTION discards every grant on the old object, and a freshly
-- CREATEd function defaults to PUBLIC (anon included) having EXECUTE - so
-- between 20260904169 landing and this migration, the function was openly
-- callable by an unauthenticated client.
--
-- 20260904169's own file has since been corrected in place to include this
-- same block (so a fresh `db reset` never has the gap at all), but that
-- migration was already applied to the linked project before the gap was
-- caught - `supabase db push` tracks by version, not content, so the
-- correction needs its own migration to actually reach an environment
-- that already ran 169. Idempotent either way (revoke/grant re-running
-- on a fresh environment where 169's corrected version already set this
-- is a harmless no-op).

revoke all on function public.get_staff_availability(
  public.staff_role[], uuid, timestamptz, timestamptz, uuid, uuid
) from public;
grant execute on function public.get_staff_availability(
  public.staff_role[], uuid, timestamptz, timestamptz, uuid, uuid
) to authenticated;
grant execute on function public.get_staff_availability(
  public.staff_role[], uuid, timestamptz, timestamptz, uuid, uuid
) to service_role;
