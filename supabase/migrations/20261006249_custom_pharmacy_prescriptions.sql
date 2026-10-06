-- Custom change (pharmacy prescriptions): a vet prescribes medicine with a
-- quantity and says where the customer is buying it. Bought from this
-- branch's pharmacy, it becomes its own Pending transaction the cashier
-- settles and the customer can pay with credit; bought anywhere else, it
-- stays a medical record and nothing is charged.
--
-- consultations.sold_at_pharmacy: true = this branch's pharmacy (billed),
-- false = another pharmacy (not billed). Defaults to false so no existing or
-- new visit is ever charged for medicine without the vet choosing it.
--
-- consultations.medication_transaction_id: the transaction billing this
-- visit's medicines, when there is one - how pharmacyCharge.service.ts finds
-- the row to rewrite/remove when an unpaid prescription is edited, and how
-- checkoutAggregation.service.ts tells a medicine sale apart from the
-- booking-time estimate charge it supersedes. ON DELETE SET NULL: the link
-- is a pointer, never a reason a transaction can't be removed.
--
-- Quantity and the medicine-list entry each prescribed medicine came from
-- live inside the existing consultations.medications jsonb - no column.

alter table public.consultations
  add column sold_at_pharmacy boolean not null default false,
  add column medication_transaction_id uuid
    references public.transactions(id) on delete set null;

create index consultations_medication_transaction_id_idx
  on public.consultations(medication_transaction_id);

-- ---------------------------------------------------------------------------
-- vet_medication_catalog: one clinic-wide list instead of one per vet.
-- ---------------------------------------------------------------------------
-- default_price is now the pharmacy's selling price, so it can't differ
-- depending on which vet prescribes - any Veterinarian may read, add to,
-- edit or remove any entry. veterinarian_id stays, as "added by". Existing
-- per-vet entries are kept as they are and simply become visible to every
-- vet. The server uses the service-role key (vetCatalog.service.ts); these
-- policies keep direct access in step with it.

drop policy "Veterinarians can read their own medication catalog"
  on public.vet_medication_catalog;
drop policy "Veterinarians can insert their own medication catalog"
  on public.vet_medication_catalog;
drop policy "Veterinarians can update their own medication catalog"
  on public.vet_medication_catalog;
drop policy "Veterinarians can delete their own medication catalog"
  on public.vet_medication_catalog;

create policy "Veterinarians can read the medication catalog"
  on public.vet_medication_catalog
  for select
  to authenticated
  using (public.current_staff_role() = 'Veterinarian');

create policy "Veterinarians can add to the medication catalog"
  on public.vet_medication_catalog
  for insert
  to authenticated
  with check (
    auth.uid() = veterinarian_id
    and public.current_staff_role() = 'Veterinarian'
  );

create policy "Veterinarians can update the medication catalog"
  on public.vet_medication_catalog
  for update
  to authenticated
  using (public.current_staff_role() = 'Veterinarian')
  with check (public.current_staff_role() = 'Veterinarian');

create policy "Veterinarians can delete from the medication catalog"
  on public.vet_medication_catalog
  for delete
  to authenticated
  using (public.current_staff_role() = 'Veterinarian');
