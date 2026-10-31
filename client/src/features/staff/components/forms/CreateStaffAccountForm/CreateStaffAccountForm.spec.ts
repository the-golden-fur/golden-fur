import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import * as staffApi from '../../../api/staff.api';
import { CreateStaffAccountForm } from './CreateStaffAccountForm';

vi.mock('../../../api/staff.api', () => ({
  createStaffAccount: vi.fn(),
  resendAccountEmail: vi.fn(),
}));

const BRANCHES = [
  { id: 'branch-a', name: 'Makati', is_vet_branch: true },
  { id: 'branch-b', name: 'Southwoods', is_vet_branch: false },
];

function renderForm(
  overrides: {
    viewerRole?: 'Admin' | 'Superadmin';
    onCreated?: () => void;
  } = {}
) {
  const onCreated = overrides.onCreated ?? vi.fn();

  render(
    createElement(CreateStaffAccountForm, {
      accessToken: 'token',
      viewerRole: overrides.viewerRole ?? 'Admin',
      viewerBranchId: 'branch-a',
      branches: BRANCHES,
      onCreated,
    })
  );

  return { onCreated };
}

describe('CreateStaffAccountForm', () => {
  it('Issue #73: also shows the branch selector for an Admin viewer (full parity with Superadmin), defaulting to their own branch', async () => {
    vi.mocked(staffApi.createStaffAccount).mockResolvedValue({
      data: {
        staff: { id: 'new-staff' } as never,
        temporary_password: 'tmp-pass',
      },
      error: null,
    });
    renderForm({ viewerRole: 'Admin' });

    const branchSelect = screen.getByLabelText(/new hire branch/i);
    expect(branchSelect).toBeInTheDocument();
    // Both real branches are offered, by name - not just the Admin's own
    // branch-scoped staff list, and not a raw UUID.
    expect(screen.getByRole('option', { name: 'Makati' })).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Southwoods' })
    ).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/^username$/i), 'new.hire');
    await userEvent.type(
      screen.getByLabelText(/registered email/i),
      'new.hire@goldenfur.com'
    );
    await userEvent.type(screen.getByLabelText(/^first name$/i), 'New');
    await userEvent.type(screen.getByLabelText(/^last name$/i), 'Hire');
    await userEvent.type(screen.getByLabelText(/^nickname/i), 'Newbie');
    expect(screen.getByText(/Shown as: Newbie/)).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: /create staff account/i })
    );

    expect(staffApi.createStaffAccount).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        username: 'new.hire',
        registered_email: 'new.hire@goldenfur.com',
        first_name: 'New',
        middle_name: null,
        last_name: 'Hire',
        nickname: 'Newbie',
        branch_id: 'branch-a',
      })
    );
    expect(await screen.findByText(/temporary password/i)).toBeInTheDocument();
    expect(screen.getByText('tmp-pass')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /resend account email/i })
    ).toBeInTheDocument();
  });

  it('shows the branch selector for a Superadmin viewer', () => {
    renderForm({ viewerRole: 'Superadmin' });

    expect(screen.getByLabelText(/new hire branch/i)).toBeInTheDocument();
  });

  it('shows a validation error and never calls the API when required fields are blank', async () => {
    renderForm();

    await userEvent.click(
      screen.getByRole('button', { name: /create staff account/i })
    );

    expect(
      await screen.findByText(
        /username, registered email, first name and last name are required/i
      )
    ).toBeInTheDocument();
    expect(staffApi.createStaffAccount).not.toHaveBeenCalled();
  });

  it('surfaces the server error message on failure (e.g. duplicate username)', async () => {
    vi.mocked(staffApi.createStaffAccount).mockResolvedValue({
      data: null,
      error: 'Username already exists',
    });
    renderForm();

    await userEvent.type(screen.getByLabelText(/^username$/i), 'taken');
    await userEvent.type(
      screen.getByLabelText(/registered email/i),
      'taken@goldenfur.com'
    );
    await userEvent.type(screen.getByLabelText(/^first name$/i), 'Tak');
    await userEvent.type(screen.getByLabelText(/^last name$/i), 'En');
    await userEvent.click(
      screen.getByRole('button', { name: /create staff account/i })
    );

    expect(
      await screen.findByText(/username already exists/i)
    ).toBeInTheDocument();
  });
});
