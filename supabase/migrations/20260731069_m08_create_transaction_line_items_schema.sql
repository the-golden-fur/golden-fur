-- Sprint 5 Epic A (#82): M08 transaction_line_items - the individual
-- billable lines composing a transaction (service/addon charges, discount/
-- promo reductions, reschedule fees, misc-sale items).
--
-- line_item_type is plain text, not a new enum - matching the established
-- hotel_stays.status/daycare_sessions.status convention of plain text for a
-- lifecycle/category field a later sprint (M14, Sprint 6) may need to
-- extend without a schema migration. Documented allowed values: service,
-- addon, discount, promo, reschedule_fee, misc_sale_item.
--
-- reference_id is a polymorphic pointer (services.id / packages.id /
-- discounts.id / promos.id / product_catalog.id depending on
-- line_item_type) with no FK constraint, since the target table varies -
-- documented here instead of enforced at the DB layer.
--
-- Discount/promo/reschedule-fee rows store a negative (or explicitly
-- signed) line_total, so SUM(line_total) always equals transactions.
-- total_amount with no special-casing of subtractive rows downstream.

create table public.transaction_line_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  line_item_type text not null,
  reference_id uuid,
  description text not null,
  quantity integer not null default 1,
  unit_price numeric(10, 2) not null,
  line_total numeric(10, 2) not null,
  created_at timestamptz not null default now()
);

create index transaction_line_items_transaction_id_idx
  on public.transaction_line_items(transaction_id);

alter table public.transaction_line_items enable row level security;

create policy "Money-handling staff can read all transaction line items"
  on public.transaction_line_items
  for select
  to authenticated
  using (
    public.current_staff_role() in (
      'Superadmin', 'Admin', 'Supervisor', 'Receptionist', 'Cashier'
    )
  );

create policy "Customers can read their own transaction line items"
  on public.transaction_line_items
  for select
  to authenticated
  using (
    exists (
      select 1 from public.transactions t
      where t.id = transaction_line_items.transaction_id
        and t.customer_id = auth.uid()
    )
  );

create policy "Money-handling staff can create transaction line items"
  on public.transaction_line_items
  for insert
  to authenticated
  with check (
    public.current_staff_role() in (
      'Superadmin', 'Admin', 'Supervisor', 'Receptionist', 'Cashier'
    )
  );

-- Mirrors transactions' own update/delete restriction: only Admin/
-- Superadmin, and only for a miscellaneous_sale transaction's lines.
create policy "Admins and superadmins can update miscellaneous sale line items"
  on public.transaction_line_items
  for update
  to authenticated
  using (
    public.current_staff_role() in ('Admin', 'Superadmin')
    and exists (
      select 1 from public.transactions t
      where t.id = transaction_line_items.transaction_id
        and t.transaction_type = 'miscellaneous_sale'
    )
  )
  with check (
    public.current_staff_role() in ('Admin', 'Superadmin')
    and exists (
      select 1 from public.transactions t
      where t.id = transaction_line_items.transaction_id
        and t.transaction_type = 'miscellaneous_sale'
    )
  );

create policy "Admins and superadmins can delete miscellaneous sale line items"
  on public.transaction_line_items
  for delete
  to authenticated
  using (
    public.current_staff_role() in ('Admin', 'Superadmin')
    and exists (
      select 1 from public.transactions t
      where t.id = transaction_line_items.transaction_id
        and t.transaction_type = 'miscellaneous_sale'
    )
  );

-- ---------------------------------------------------------------------------
-- Forward-declared FK from migration 20260726049 (M13 Epic B, #84): M08's
-- transactions table did not exist yet when transaction_promo_selections was
-- created, so the FK was documented in a comment only. It exists now.
-- ---------------------------------------------------------------------------

alter table public.transaction_promo_selections
  add constraint transaction_promo_selections_transaction_id_fkey
  foreign key (transaction_id) references public.transactions(id) on delete cascade;

comment on table public.transaction_promo_selections is
  'One row per eligible promo shown to a customer at checkout/booking '
  'review. transaction_id FK added in migration 20260731069 (M08, #82) - '
  'transactions did not exist when this table was created (Epic B, #84).';
