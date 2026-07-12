import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { PendingUnavailabilityBlock } from '../../../staff.types';
import { UnavailabilityReviewCard } from './UnavailabilityReviewCard';

function makeBlock(
  overrides: Partial<PendingUnavailabilityBlock> = {}
): PendingUnavailabilityBlock {
  return {
    id: 'block-1',
    staff_id: 'staff-2',
    start_time: '2026-07-14T01:00:00.000Z',
    end_time: '2026-07-14T03:00:00.000Z',
    reason: 'Doctor appointment',
    created_by: 'staff-2',
    created_at: '2026-07-13T00:00:00.000Z',
    status: 'pending',
    is_quick_action: false,
    reviewed_by: null,
    reviewed_at: null,
    denial_reason: null,
    reviewable: true,
    staff: {
      id: 'staff-2',
      display_name: 'Staff Two',
      profile_photo_url: null,
      role: 'Groomer',
      branch_id: 'branch-a',
    },
    ...overrides,
  };
}

describe('UnavailabilityReviewCard', () => {
  it('renders Approve/Deny for a reviewable block and calls onApprove', async () => {
    const onApprove = vi.fn();
    const onDeny = vi.fn();
    render(
      createElement(UnavailabilityReviewCard, {
        block: makeBlock(),
        onApprove,
        onDeny,
      })
    );

    expect(screen.getByText('Staff Two')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /approve/i }));

    expect(onApprove).toHaveBeenCalled();
  });

  it('opens the deny reason field and calls onDeny with the trimmed reason', async () => {
    const onDeny = vi.fn();
    render(
      createElement(UnavailabilityReviewCard, {
        block: makeBlock(),
        onApprove: vi.fn(),
        onDeny,
      })
    );

    await userEvent.click(screen.getByRole('button', { name: /^deny$/i }));
    await userEvent.type(screen.getByLabelText(/reason/i), '  Short staffed  ');
    await userEvent.click(
      screen.getByRole('button', { name: /confirm deny/i })
    );

    expect(onDeny).toHaveBeenCalledWith('Short staffed');
  });

  it('calls onDeny with undefined when no reason is given', async () => {
    const onDeny = vi.fn();
    render(
      createElement(UnavailabilityReviewCard, {
        block: makeBlock(),
        onApprove: vi.fn(),
        onDeny,
      })
    );

    await userEvent.click(screen.getByRole('button', { name: /^deny$/i }));
    await userEvent.click(
      screen.getByRole('button', { name: /confirm deny/i })
    );

    expect(onDeny).toHaveBeenCalledWith(undefined);
  });

  it('#30 AC-7: renders read-only with no Approve/Deny for a non-reviewable block', () => {
    render(
      createElement(UnavailabilityReviewCard, {
        block: makeBlock({ reviewable: false }),
        onApprove: vi.fn(),
        onDeny: vi.fn(),
      })
    );

    expect(
      screen.queryByRole('button', { name: /approve/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^deny$/i })
    ).not.toBeInTheDocument();
    expect(screen.getByText(/awaiting review/i)).toBeInTheDocument();
  });
});
