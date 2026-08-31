import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SlotPicker } from './SlotPicker';
import * as bookingApi from '../../api/booking.api';

vi.mock('../../api/booking.api', () => ({
  getDayAvailability: vi.fn(),
}));

const WINDOW = { open: '08:00', close: '18:00' };

const SLOTS = [
  {
    start: '2026-08-03T01:00:00.000Z',
    end: '2026-08-03T02:00:00.000Z',
    available: true,
    level: 'available' as const,
    eligible_staff_count: 2,
  },
  {
    start: '2026-08-03T02:00:00.000Z',
    end: '2026-08-03T03:00:00.000Z',
    available: false,
    level: 'full' as const,
    eligible_staff_count: 0,
  },
];

function openDropdown() {
  const input = screen.getByLabelText('Appointment time');
  fireEvent.focus(input);
  return input;
}

describe('SlotPicker', () => {
  it('AC-1: customer mode does not expose staff coverage-level text', async () => {
    vi.mocked(bookingApi.getDayAvailability).mockResolvedValue({
      data: { slots: SLOTS, window: WINDOW },
      error: null,
    });

    render(
      createElement(SlotPicker, {
        accessToken: 'token',
        branchId: 'branch-1',
        serviceCategory: 'Grooming',
        slotDurationMinutes: 60,
        viewerMode: 'customer',
        selectedSlot: null,
        onSelect: vi.fn(),
      })
    );

    await waitFor(() => screen.getByLabelText('Appointment time'));
    openDropdown();

    await waitFor(() =>
      expect(screen.getAllByRole('option')).toHaveLength(SLOTS.length)
    );

    expect(screen.queryByText('2 slots available')).not.toBeInTheDocument();
    expect(screen.queryByText('No slots available')).not.toBeInTheDocument();
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
  });

  it('AC-2: staff mode shows the actual available-slot count as text', async () => {
    vi.mocked(bookingApi.getDayAvailability).mockResolvedValue({
      data: { slots: SLOTS, window: WINDOW },
      error: null,
    });

    render(
      createElement(SlotPicker, {
        accessToken: 'token',
        branchId: 'branch-1',
        serviceCategory: 'Grooming',
        slotDurationMinutes: 60,
        viewerMode: 'staff',
        selectedSlot: null,
        onSelect: vi.fn(),
      })
    );

    await waitFor(() => screen.getByLabelText('Appointment time'));
    openDropdown();

    await waitFor(() =>
      expect(screen.getAllByRole('option')).toHaveLength(SLOTS.length)
    );

    expect(screen.getByText('2 slots available')).toBeInTheDocument();
    expect(screen.getByText('No slots available')).toBeInTheDocument();
  });

  it('AC-3: shows an empty state with no slots for the date', async () => {
    vi.mocked(bookingApi.getDayAvailability).mockResolvedValue({
      data: { slots: [], window: null },
      error: null,
    });

    render(
      createElement(SlotPicker, {
        accessToken: 'token',
        branchId: 'branch-1',
        serviceCategory: 'Hotel',
        slotDurationMinutes: 60,
        petWeightClass: 'S',
        viewerMode: 'customer',
        selectedSlot: null,
        onSelect: vi.fn(),
      })
    );

    await waitFor(() =>
      expect(screen.getByText(/no availability/i)).toBeInTheDocument()
    );
  });

  it('calls onSelect with the slot window when an available option is clicked', async () => {
    vi.mocked(bookingApi.getDayAvailability).mockResolvedValue({
      data: { slots: SLOTS, window: WINDOW },
      error: null,
    });
    const onSelect = vi.fn();

    render(
      createElement(SlotPicker, {
        accessToken: 'token',
        branchId: 'branch-1',
        serviceCategory: 'Grooming',
        slotDurationMinutes: 60,
        viewerMode: 'customer',
        selectedSlot: null,
        onSelect,
      })
    );

    await waitFor(() => screen.getByLabelText('Appointment time'));
    openDropdown();

    const listbox = await screen.findByRole('listbox');

    await waitFor(() =>
      expect(within(listbox).getAllByRole('button')).toHaveLength(SLOTS.length)
    );

    fireEvent.click(within(listbox).getAllByRole('button')[0]);

    expect(onSelect).toHaveBeenCalledWith({
      start: SLOTS[0].start,
      end: SLOTS[0].end,
    });
  });

  it('disables the unavailable option in the dropdown', async () => {
    vi.mocked(bookingApi.getDayAvailability).mockResolvedValue({
      data: { slots: SLOTS, window: WINDOW },
      error: null,
    });

    render(
      createElement(SlotPicker, {
        accessToken: 'token',
        branchId: 'branch-1',
        serviceCategory: 'Grooming',
        slotDurationMinutes: 60,
        viewerMode: 'customer',
        selectedSlot: null,
        onSelect: vi.fn(),
      })
    );

    await waitFor(() => screen.getByLabelText('Appointment time'));
    openDropdown();

    const listbox = await screen.findByRole('listbox');
    const buttons = await waitFor(() => {
      const found = within(listbox).getAllByRole('button');
      expect(found).toHaveLength(SLOTS.length);
      return found;
    });

    expect(buttons[1]).toBeDisabled();
  });

  it('bounds the time input to the branch operating-hours window', async () => {
    vi.mocked(bookingApi.getDayAvailability).mockResolvedValue({
      data: { slots: SLOTS, window: WINDOW },
      error: null,
    });

    render(
      createElement(SlotPicker, {
        accessToken: 'token',
        branchId: 'branch-1',
        serviceCategory: 'Grooming',
        slotDurationMinutes: 60,
        viewerMode: 'customer',
        selectedSlot: null,
        onSelect: vi.fn(),
      })
    );

    const input = (await waitFor(() =>
      screen.getByLabelText('Appointment time')
    )) as HTMLInputElement;

    expect(input.min).toBe(WINDOW.open);
    expect(input.max).toBe(WINDOW.close);
  });

  it('minimum-notice lead time: floors the calendar N days out and advances off the notice window (advisor addendum)', async () => {
    vi.mocked(bookingApi.getDayAvailability).mockResolvedValue({
      data: { slots: SLOTS, window: WINDOW, minNoticeDays: 3 },
      error: null,
    });

    render(
      createElement(SlotPicker, {
        accessToken: 'token',
        branchId: 'branch-1',
        serviceCategory: 'Grooming',
        slotDurationMinutes: 60,
        viewerMode: 'customer',
        selectedSlot: null,
        onSelect: vi.fn(),
      })
    );

    // The floor: local "today" + 3 days, computed the way the component does
    // (todayIso() local calendar date, then UTC-midnight day arithmetic).
    const now = new Date();
    const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const floorDate = new Date(`${localToday}T00:00:00Z`);
    floorDate.setUTCDate(floorDate.getUTCDate() + 3);
    const floor = floorDate.toISOString().slice(0, 10);

    const dateInput = (await screen.findByLabelText(
      'Date'
    )) as HTMLInputElement;

    await waitFor(() => expect(dateInput.min).toBe(floor));
    // Auto-advanced past the 3-day notice window rather than sitting on today.
    await waitFor(() => expect(dateInput.value).toBe(floor));
    expect(screen.getByText('Previous day')).toBeDisabled();
    expect(screen.getByText(/at least 3 days notice/i)).toBeInTheDocument();
  });

  it('never lets a past date be selected (repro: navigating back a few days still showed a bookable slot)', async () => {
    vi.mocked(bookingApi.getDayAvailability).mockResolvedValue({
      data: { slots: SLOTS, window: WINDOW },
      error: null,
    });

    render(
      createElement(SlotPicker, {
        accessToken: 'token',
        branchId: 'branch-1',
        serviceCategory: 'Grooming',
        slotDurationMinutes: 60,
        viewerMode: 'customer',
        selectedSlot: null,
        onSelect: vi.fn(),
      })
    );

    // Local calendar date, matching the component's own todayIso() - not
    // .toISOString(), which reports the UTC date and would flake in any
    // positive-UTC-offset timezone (see the regression test below).
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const dateInput = screen.getByLabelText('Date') as HTMLInputElement;

    expect(dateInput.min).toBe(today);
    expect(screen.getByText('Previous day')).toBeDisabled();

    // Typing/pasting an earlier date directly clamps back to today rather
    // than accepting it (defense in depth beyond the native min attribute,
    // which some browsers don't strictly enforce on typed input).
    fireEvent.change(dateInput, { target: { value: '2000-01-01' } });
    expect(dateInput.value).toBe(today);
  });

  it('regression: min date is the local calendar date, not the UTC one (repro: 7:40 AM Asia/Manila still let yesterday be picked)', async () => {
    const originalTz = process.env.TZ;
    process.env.TZ = 'Asia/Manila';
    vi.useFakeTimers();
    // 07:40 AM Asia/Manila (UTC+8) on 2026-07-29 == 2026-07-28T23:40:00Z.
    vi.setSystemTime(new Date('2026-07-28T23:40:00.000Z'));

    vi.mocked(bookingApi.getDayAvailability).mockResolvedValue({
      data: { slots: SLOTS, window: WINDOW },
      error: null,
    });

    render(
      createElement(SlotPicker, {
        accessToken: 'token',
        branchId: 'branch-1',
        serviceCategory: 'Grooming',
        slotDurationMinutes: 60,
        viewerMode: 'customer',
        selectedSlot: null,
        onSelect: vi.fn(),
      })
    );

    const dateInput = screen.getByLabelText('Date') as HTMLInputElement;

    expect(dateInput.min).toBe('2026-07-29');
    expect(dateInput.value).toBe('2026-07-29');

    process.env.TZ = originalTz;
    vi.useRealTimers();
  });

  it('shows cage availability for Hotel bookings, separate from the date/time slot itself', async () => {
    vi.mocked(bookingApi.getDayAvailability).mockResolvedValue({
      data: {
        slots: [
          {
            start: '2026-08-03T01:00:00.000Z',
            end: '2026-08-04T01:00:00.000Z',
            available: true,
            level: 'partial',
            cage_capacity_remaining: 3,
            cage_capacity_total: 8,
          },
        ],
        window: { open: '08:00', close: '08:00' },
      },
      error: null,
    });

    render(
      createElement(SlotPicker, {
        accessToken: 'token',
        branchId: 'branch-1',
        serviceCategory: 'Hotel',
        slotDurationMinutes: 1440,
        petWeightClass: 'M',
        viewerMode: 'customer',
        selectedSlot: null,
        onSelect: vi.fn(),
      })
    );

    expect(
      await screen.findByText(/Cage availability for this size: 3 of 8 free/)
    ).toBeInTheDocument();
  });

  // Walk-in booking flow (custom change): lockToNow selects a slot that
  // STARTS AT THE CURRENT TIME (not a browsed availability slot) and renders
  // a non-interactive banner instead of the date-nav + TimeSlotInput grid.
  describe('lockToNow (walk-in booking flow)', () => {
    it('auto-selects a slot starting at the current minute (no click), and hides the date-nav/time-grid controls', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-30T07:51:23.456Z'));
      const onSelect = vi.fn();

      render(
        createElement(SlotPicker, {
          accessToken: 'token',
          branchId: 'branch-1',
          serviceCategory: 'Grooming',
          slotDurationMinutes: 60,
          viewerMode: 'staff',
          selectedSlot: null,
          onSelect,
          lockToNow: true,
        })
      );

      // Seconds/ms zeroed; end is start + the service duration.
      expect(onSelect).toHaveBeenCalledWith({
        start: '2026-08-30T07:51:00.000Z',
        end: '2026-08-30T08:51:00.000Z',
      });

      expect(screen.getByText('Walk-in — starting now')).toBeInTheDocument();
      expect(screen.queryByLabelText('Date')).not.toBeInTheDocument();
      expect(
        screen.queryByLabelText('Appointment time')
      ).not.toBeInTheDocument();
      expect(screen.queryByText('Previous day')).not.toBeInTheDocument();

      vi.useRealTimers();
    });

    it('never fetches day availability while locked (the slot is "now", not browsed)', async () => {
      const onSelect = vi.fn();

      render(
        createElement(SlotPicker, {
          accessToken: 'token',
          branchId: 'branch-1',
          serviceCategory: 'Grooming',
          slotDurationMinutes: 60,
          viewerMode: 'staff',
          selectedSlot: null,
          onSelect,
          lockToNow: true,
        })
      );

      await waitFor(() => expect(onSelect).toHaveBeenCalled());
      expect(bookingApi.getDayAvailability).not.toHaveBeenCalled();
    });
  });

  describe('onAvailabilityChange', () => {
    it('#22 follow-up: reports hasAnySlots=false for an empty day (branch closed, or today already past hours)', async () => {
      vi.mocked(bookingApi.getDayAvailability).mockResolvedValue({
        data: { slots: [], window: null },
        error: null,
      });
      const onAvailabilityChange = vi.fn();

      render(
        createElement(SlotPicker, {
          accessToken: 'token',
          branchId: 'branch-1',
          serviceCategory: 'Grooming',
          slotDurationMinutes: 60,
          viewerMode: 'customer',
          selectedSlot: null,
          onSelect: vi.fn(),
          onAvailabilityChange,
        })
      );

      await waitFor(() =>
        expect(onAvailabilityChange).toHaveBeenCalledWith(
          expect.objectContaining({
            hasAnySlots: false,
            hasAnyAvailable: false,
          })
        )
      );
    });

    it('#22 follow-up: reports hasAnySlots=true, hasAnyAvailable=false when real candidates exist but are all taken', async () => {
      vi.mocked(bookingApi.getDayAvailability).mockResolvedValue({
        data: {
          slots: SLOTS.map((slot) => ({ ...slot, available: false })),
          window: WINDOW,
        },
        error: null,
      });
      const onAvailabilityChange = vi.fn();

      render(
        createElement(SlotPicker, {
          accessToken: 'token',
          branchId: 'branch-1',
          serviceCategory: 'Grooming',
          slotDurationMinutes: 60,
          viewerMode: 'customer',
          selectedSlot: null,
          onSelect: vi.fn(),
          onAvailabilityChange,
        })
      );

      await waitFor(() =>
        expect(onAvailabilityChange).toHaveBeenCalledWith(
          expect.objectContaining({ hasAnySlots: true, hasAnyAvailable: false })
        )
      );
    });

    it('#22 follow-up: reports hasAnyAvailable=true when at least one candidate is open', async () => {
      vi.mocked(bookingApi.getDayAvailability).mockResolvedValue({
        data: { slots: SLOTS, window: WINDOW },
        error: null,
      });
      const onAvailabilityChange = vi.fn();

      render(
        createElement(SlotPicker, {
          accessToken: 'token',
          branchId: 'branch-1',
          serviceCategory: 'Grooming',
          slotDurationMinutes: 60,
          viewerMode: 'customer',
          selectedSlot: null,
          onSelect: vi.fn(),
          onAvailabilityChange,
        })
      );

      await waitFor(() =>
        expect(onAvailabilityChange).toHaveBeenCalledWith(
          expect.objectContaining({ hasAnySlots: true, hasAnyAvailable: true })
        )
      );
    });
  });
});
