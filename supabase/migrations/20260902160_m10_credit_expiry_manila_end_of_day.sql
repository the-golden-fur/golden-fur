-- Credit expiry: land every lot's expires_at on the end of its Manila
-- calendar day (feat/credit-expiry-visibility-and-config, follow-up).
--
-- WHY: 20260902159 stamped rolling lots at `created_at + N days` (an exact
-- time of day) and fixed_date lots at UTC end-of-day. Two lots issued a few
-- hours apart on the same day then got expires_at values a few hours apart,
-- so the customer credits page showed them as two separate "Oct 1" rows with
-- different "days left", and a UTC end-of-day for "Dec 31" reads as "Jan 1"
-- in Manila. Credit expires per calendar day in the one timezone every
-- branch uses (Asia/Manila, UTC+8, no DST) - so snap every not-yet-swept
-- issuance lot, and both branches of reapply_branch_credit_expiry(), to the
-- end of the Manila day. cancellation.service.ts does the same for new lots
-- (creditExpiry.util.ts). expire_credits() is unchanged.

update public.credit_transactions
set expires_at =
  ((expires_at at time zone 'Asia/Manila')::date + time '23:59:59.999')
    at time zone 'Asia/Manila'
where transaction_type = 'issuance'
  and expired_at is null
  and expires_at is not null;

create or replace function public.reapply_branch_credit_expiry(
  p_branch_ids uuid[],
  p_mode public.credit_expiry_mode,
  p_days integer,
  p_fixed_date date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_expires_at timestamptz;
  v_updated integer := 0;
begin
  if p_branch_ids is null or array_length(p_branch_ids, 1) is null then
    return 0;
  end if;

  if p_mode = 'rolling' and p_days is null then
    raise exception 'reapply_branch_credit_expiry: rolling mode needs p_days';
  end if;
  if p_mode = 'fixed_date' and p_fixed_date is null then
    raise exception 'reapply_branch_credit_expiry: fixed_date mode needs p_fixed_date';
  end if;

  -- fixed_date -> end of that Manila calendar day.
  if p_mode = 'fixed_date' then
    v_new_expires_at :=
      (p_fixed_date + time '23:59:59.999') at time zone 'Asia/Manila';
  end if;

  update public.credit_transactions ct
    set expires_at = case p_mode
      when 'none' then null
      when 'rolling' then
        (((ct.created_at + make_interval(days => p_days))
          at time zone 'Asia/Manila')::date + time '23:59:59.999')
          at time zone 'Asia/Manila'
      when 'fixed_date' then v_new_expires_at
    end
    from public.credit_balances cb
    where ct.credit_balance_id = cb.id
      and cb.branch_id = any (p_branch_ids)
      and ct.transaction_type = 'issuance'
      and ct.expired_at is null;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke all on function public.reapply_branch_credit_expiry(uuid[], public.credit_expiry_mode, integer, date) from public;
grant execute on function public.reapply_branch_credit_expiry(uuid[], public.credit_expiry_mode, integer, date) to service_role;
