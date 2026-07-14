import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import * as staffAuthApi from '../../../api/staffAuth.api';
import { StaffResetPasswordForm } from './StaffResetPasswordForm';

vi.mock('../../../api/staffAuth.api', () => ({
  establishRecoverySession: vi.fn(),
  updateStaffPassword: vi.fn(),
}));

function renderForm() {
  return render(
    createElement(MemoryRouter, null, createElement(StaffResetPasswordForm))
  );
}

describe('StaffResetPasswordForm', () => {
  it('shows an error and a link back to login when the reset link is invalid/expired', async () => {
    vi.mocked(staffAuthApi.establishRecoverySession).mockResolvedValue({
      data: null,
      error: 'Reset link is invalid or has expired. Request a new one.',
    });
    renderForm();

    expect(
      await screen.findByText(/reset link is invalid or has expired/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /back to login/i })
    ).toHaveAttribute('href', '/staff/login');
  });

  it('submits a valid new password and shows a success message', async () => {
    vi.mocked(staffAuthApi.establishRecoverySession).mockResolvedValue({
      data: null,
      error: null,
    });
    vi.mocked(staffAuthApi.updateStaffPassword).mockResolvedValue({
      data: null,
      error: null,
    });
    renderForm();

    await userEvent.type(
      await screen.findByLabelText(/^new password$/i),
      'newpassword123'
    );
    await userEvent.type(
      screen.getByLabelText(/confirm new password/i),
      'newpassword123'
    );
    await userEvent.click(
      screen.getByRole('button', { name: /set new password/i })
    );

    expect(staffAuthApi.updateStaffPassword).toHaveBeenCalledWith(
      'newpassword123'
    );
    expect(await screen.findByText(/password updated/i)).toBeInTheDocument();
  });

  it('shows a validation error and never calls the API when passwords do not match', async () => {
    vi.mocked(staffAuthApi.establishRecoverySession).mockResolvedValue({
      data: null,
      error: null,
    });
    renderForm();

    await userEvent.type(
      await screen.findByLabelText(/^new password$/i),
      'newpassword123'
    );
    await userEvent.type(
      screen.getByLabelText(/confirm new password/i),
      'different123'
    );
    await userEvent.click(
      screen.getByRole('button', { name: /set new password/i })
    );

    expect(
      await screen.findByText(/passwords do not match/i)
    ).toBeInTheDocument();
    expect(staffAuthApi.updateStaffPassword).not.toHaveBeenCalled();
  });

  it('surfaces a server error when updating the password fails', async () => {
    vi.mocked(staffAuthApi.establishRecoverySession).mockResolvedValue({
      data: null,
      error: null,
    });
    vi.mocked(staffAuthApi.updateStaffPassword).mockResolvedValue({
      data: null,
      error: 'Password too weak',
    });
    renderForm();

    await userEvent.type(
      await screen.findByLabelText(/^new password$/i),
      'newpassword123'
    );
    await userEvent.type(
      screen.getByLabelText(/confirm new password/i),
      'newpassword123'
    );
    await userEvent.click(
      screen.getByRole('button', { name: /set new password/i })
    );

    expect(await screen.findByText(/password too weak/i)).toBeInTheDocument();
  });
});
