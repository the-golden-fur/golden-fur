-- High-price seeded services (>= ~PHP 1,000) now require a 50% downpayment,
-- matching the existing convention on Overnight Stay (Aircon Room) - see
-- 20260808112. A customer/receptionist selecting one of these during
-- booking is now restricted to that single service (see
-- CustomerBookingFlowPage.tsx's toggleServiceSelect + booking.service.ts's
-- server-side enforcement of the same rule).

update public.services
set requires_downpayment = true,
    downpayment_type = 'Percentage',
    downpayment_amount = 50
where id in (
  'a1300000-0000-4000-a000-000000000019', -- Dental Cleaning (1500)
  'a1300000-0000-4000-a000-000000000020', -- Surgery (3000)
  'a1300000-0000-4000-a000-000000000021'  -- Emergency Consultation (1000)
);
