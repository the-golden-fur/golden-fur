import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { BugReportFormModal } from './BugReportFormModal';
import * as bugReportsApi from '../../api/bugReports.api';

vi.mock('../../api/bugReports.api', () => ({
  createBugReport: vi.fn(),
}));

function renderModal(onClose = vi.fn()) {
  return render(
    createElement(BugReportFormModal, {
      isOpen: true,
      onClose,
      accessToken: 'token',
    })
  );
}

describe('BugReportFormModal', () => {
  it('defaults to "bug" and submits the chosen category, title, and description', async () => {
    const user = userEvent.setup();
    vi.mocked(bugReportsApi.createBugReport).mockResolvedValue({
      data: {
        id: 'report-1',
        reporter_customer_id: 'cust-1',
        reporter_staff_id: null,
        category: 'bug',
        title: 'Upload fails',
        description: 'It spins forever.',
        status: 'pending',
        reviewed_by: null,
        reviewed_at: null,
        created_at: '2026-11-02T00:00:00.000Z',
        updated_at: '2026-11-02T00:00:00.000Z',
      },
      error: null,
    });

    renderModal();

    expect(
      screen.getByRole('radio', { name: "Something's broken (bug)" })
    ).toBeChecked();

    await user.type(screen.getByLabelText('Title'), 'Upload fails');
    await user.type(screen.getByLabelText('Description'), 'It spins forever.');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(bugReportsApi.createBugReport).toHaveBeenCalledWith(
      {
        category: 'bug',
        title: 'Upload fails',
        description: 'It spins forever.',
      },
      'token'
    );
    expect(
      await screen.findByText(/sent this to our development team/)
    ).toBeInTheDocument();
  });

  it('submits as a feature request when that option is picked', async () => {
    const user = userEvent.setup();
    vi.mocked(bugReportsApi.createBugReport).mockResolvedValue({
      data: {
        id: 'report-2',
        reporter_customer_id: null,
        reporter_staff_id: 'staff-1',
        category: 'feature_request',
        title: 'Dark mode',
        description: 'Please add it.',
        status: 'pending',
        reviewed_by: null,
        reviewed_at: null,
        created_at: '2026-11-02T00:00:00.000Z',
        updated_at: '2026-11-02T00:00:00.000Z',
      },
      error: null,
    });

    renderModal();

    await user.click(
      screen.getByRole('radio', { name: 'I have an idea (feature request)' })
    );
    await user.type(screen.getByLabelText('Title'), 'Dark mode');
    await user.type(screen.getByLabelText('Description'), 'Please add it.');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(bugReportsApi.createBugReport).toHaveBeenCalledWith(
      {
        category: 'feature_request',
        title: 'Dark mode',
        description: 'Please add it.',
      },
      'token'
    );
  });

  it('blocks submission with an empty title or description', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(
      screen.getByText('Please fill in both the title and the description.')
    ).toBeInTheDocument();
    expect(bugReportsApi.createBugReport).not.toHaveBeenCalled();
  });

  it('shows the server error and keeps the form editable on failure', async () => {
    const user = userEvent.setup();
    vi.mocked(bugReportsApi.createBugReport).mockResolvedValue({
      data: null,
      error: 'Could not reach the server.',
    });

    renderModal();

    await user.type(screen.getByLabelText('Title'), 'Title');
    await user.type(screen.getByLabelText('Description'), 'Description');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(
      await screen.findByText('Could not reach the server.')
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toBeInTheDocument();
  });

  it('Cancel closes the modal without submitting', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderModal(onClose);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(bugReportsApi.createBugReport).not.toHaveBeenCalled();
  });
});
