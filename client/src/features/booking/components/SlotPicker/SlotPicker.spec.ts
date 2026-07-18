import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SlotPicker } from './SlotPicker';
import * as bookingApi from '../../api/booking.api';

vi.mock('../../api/booking.api', () => ({
  getDayAvailability: vi.fn(),
}));

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

// Button order once slots render: [Previous day, Next day, slot 1, slot 2] -
// the date <input> isn't a button.
const SLOT_BUTTON_OFFSET = 2;

describe('SlotPicker', () => {
  it('AC-1: customer mode exposes only available/unavailable, no color-level classes', async () => {
    vi.mocked(bookingApi.getDayAvailability).mockResolvedValue({
      data: SLOTS,
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

    await waitFor(() =>
      expect(screen.getAllByRole('button')).toHaveLength(
        SLOT_BUTTON_OFFSET + SLOTS.length
      )
    );

    const buttons = screen.getAllByRole('button');
    expect(
      buttons.some((button) => /available|partial|full/.test(button.className))
    ).toBe(false);
  });

  it('AC-2: staff mode applies the 3-color level class', async () => {
    vi.mocked(bookingApi.getDayAvailability).mockResolvedValue({
      data: SLOTS,
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

    await waitFor(() =>
      expect(screen.getAllByRole('button')).toHaveLength(
        SLOT_BUTTON_OFFSET + SLOTS.length
      )
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons.some((b) => b.className.includes('available'))).toBe(true);
    expect(buttons.some((b) => b.className.includes('full'))).toBe(true);
  });

  it('AC-3: shows an empty state with no slots for the date', async () => {
    vi.mocked(bookingApi.getDayAvailability).mockResolvedValue({
      data: [],
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

  it('calls onSelect with the slot window when an available slot is clicked', async () => {
    vi.mocked(bookingApi.getDayAvailability).mockResolvedValue({
      data: SLOTS,
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

    await waitFor(() =>
      expect(screen.getAllByRole('button')).toHaveLength(
        SLOT_BUTTON_OFFSET + SLOTS.length
      )
    );
    fireEvent.click(screen.getAllByRole('button')[SLOT_BUTTON_OFFSET]);

    expect(onSelect).toHaveBeenCalledWith({
      start: SLOTS[0].start,
      end: SLOTS[0].end,
    });
  });
});
