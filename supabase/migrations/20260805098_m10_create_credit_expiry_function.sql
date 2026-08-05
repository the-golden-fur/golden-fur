-- Sprint 5 Epic B (#93): expire_credits() + conditional pg_cron schedule.
--
-- Walks every not-yet-swept 'issuance' credit_transactions row whose
-- expires_at has passed (oldest expiry first), writes a negative 'expiry'
-- row for whatever portion of that issuance the balance can still cover
-- (redemption isn't wired to actually decrement anything yet - Epic A's
-- creditStub.service.ts always applies 0 - so in practice today this is
-- always the full issuance amount), decrements credit_balances by the same
-- amount, and marks the issuance row's expired_at so it's never
-- reprocessed. Returns the number of issuance rows swept.
--
-- Mirrors deactivate_expired_promos()'s SECURITY DEFINER + conditional
-- pg_cron precedent (20260715032_m13_create_maintenance_schema.sql): pg_cron
-- availability is an Open Item, so the schedule below is created only if the
-- extension is already installed; otherwise
-- server/src/features/credits/services/creditExpiry.job.ts's admin-
-- triggerable endpoint is the primary mechanism, not just a verification aid.

create or replace function public.expire_credits()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_swept integer := 0;
  r record;
  v_expire_amount numeric(10, 2);
begin
  for r in
    select ct.id, ct.credit_balance_id, ct.amount, cb.balance
    from public.credit_transactions ct
    join public.credit_balances cb on cb.id = ct.credit_balance_id
    where ct.transaction_type = 'issuance'
      and ct.expired_at is null
      and ct.expires_at is not null
      and ct.expires_at < now()
    order by ct.expires_at asc
  loop
    v_expire_amount := least(r.amount, greatest(r.balance, 0));

    if v_expire_amount > 0 then
      insert into public.credit_transactions (credit_balance_id, transaction_type, amount)
      values (r.credit_balance_id, 'expiry', -v_expire_amount);

      update public.credit_balances
        set balance = balance - v_expire_amount, updated_at = now()
        where id = r.credit_balance_id;
    end if;

    update public.credit_transactions set expired_at = now() where id = r.id;
    v_swept := v_swept + 1;
  end loop;

  return v_swept;
end;
$$;

revoke all on function public.expire_credits() from public;
grant execute on function public.expire_credits() to authenticated;
grant execute on function public.expire_credits() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'expire-credits',
      '10 0 * * *',
      'select public.expire_credits()'
    );
  else
    raise notice
      'pg_cron not installed - credit expiry relies on creditExpiry.job.ts''s manual-trigger endpoint';
  end if;
end;
$$;
