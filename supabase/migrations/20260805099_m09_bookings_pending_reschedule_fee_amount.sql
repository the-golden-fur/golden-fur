-- Sprint 5 Epic B (#92): bookings.pending_reschedule_fee_amount.
--
-- GUIDE GAP: Sprint5-EpicB-Design.xlsx's DB Design sheet documents this
-- column under a "Cross-Module Note" (bookings, ALTER), and Issue #92's own
-- Development Notes say it's "written to bookings.pending_reschedule_fee_
-- amount (new nullable column, ALTER)" - but neither the Design sheet's
-- Files inventory nor the Guide's Directory Structure actually lists a
-- migration file for it among the 5 enumerated there. This migration fills
-- that gap; see this batch's custom doc for the full note.
--
-- Written by rescheduleFee.service.ts (#92) at reschedule confirmation; read
-- and cleared to NULL by Epic A's checkoutAggregation.service.ts once posted
-- as a transaction_line_items row of type 'reschedule_fee' (that read side
-- is Epic A follow-up work, not built by this epic - see Open Items).

alter table public.bookings
  add column pending_reschedule_fee_amount numeric(10, 2)
    check (pending_reschedule_fee_amount is null or pending_reschedule_fee_amount >= 0);
