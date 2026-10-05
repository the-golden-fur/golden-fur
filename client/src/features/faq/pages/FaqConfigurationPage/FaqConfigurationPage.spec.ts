import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../../staff/api/staff.api';
import type { StaffProfile, StaffRole } from '../../../staff/staff.types';
import * as faqApi from '../../api/faq.api';
import type { FaqItem } from '../../faq.types';
import { FaqConfigurationPage } from './FaqConfigurationPage';

vi.mock('../../../staff/api/staff.api', () => ({
  listStaff: vi.fn(),
}));

vi.mock('../../api/faq.api', () => ({
  listFaqs: vi.fn(),
  createFaq: vi.fn(),
  updateFaq: vi.fn(),
  deleteFaq: vi.fn(),
}));

function buildFaq(overrides: Partial<FaqItem> = {}): FaqItem {
  return {
    id: 'faq-1',
    question: 'How do I book?',
    answer: 'Use Book a Service.',
    sort_order: 1,
    is_active: true,
    created_at: '2026-10-06T00:00:00.000Z',
    updated_at: '2026-10-06T00:00:00.000Z',
    ...overrides,
  };
}

const FAQS = [
  buildFaq(),
  buildFaq({
    id: 'faq-2',
    question: 'Can I cancel?',
    answer: 'Yes, from My Bookings.',
    sort_order: 2,
  }),
  buildFaq({
    id: 'faq-3',
    question: 'Where are you?',
    answer: 'Makati and Southwoods.',
    sort_order: 3,
    is_active: false,
  }),
];

function buildViewer(role: StaffRole): StaffProfile {
  return {
    id: 'staff-1',
    branch_id: 'branch-makati',
    role,
    username: 'viewer',
    registered_email: 'viewer@example.com',
    display_name: 'Signed-in Viewer',
    profile_photo_url: null,
    phone_number: null,
    emergency_contact_name: null,
    emergency_contact_number: null,
    preferred_communication_channel: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function renderPage() {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'staff-1', email: 'staff@example.com' },
    accessToken: 'token',
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut: vi.fn(),
  };

  return render(
    createElement(
      MemoryRouter,
      { initialEntries: ['/staff/admin/maintenance/faqs'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/staff/admin/maintenance/faqs',
            element: createElement(FaqConfigurationPage),
          }),
          createElement(Route, {
            path: '/staff/settings',
            element: 'Settings page',
          })
        )
      )
    )
  );
}

/** The FAQ rows, in the order they are shown. */
async function rows() {
  const list = await screen.findByRole('list', { name: 'FAQs' });
  return within(list).getAllByRole('listitem');
}

describe('FaqConfigurationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Superadmin')],
      error: null,
    });
    vi.mocked(faqApi.listFaqs).mockResolvedValue({ data: FAQS, error: null });
    vi.mocked(faqApi.updateFaq).mockImplementation((faqId, _token, payload) =>
      Promise.resolve({
        data: { ...FAQS.find((faq) => faq.id === faqId)!, ...payload },
        error: null,
      })
    );
  });

  it('redirects anyone who is not a Superadmin to Settings', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Admin')],
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Settings page')).toBeInTheDocument();
    expect(faqApi.listFaqs).not.toHaveBeenCalled();
  });

  it('lists the FAQs in order and marks a hidden one', async () => {
    renderPage();

    const [first, second, third] = await rows();

    expect(within(first).getByText('How do I book?')).toBeInTheDocument();
    expect(within(first).getByText('Use Book a Service.')).toBeInTheDocument();
    expect(within(second).getByText('Can I cancel?')).toBeInTheDocument();
    expect(within(first).getByLabelText('Shown')).toBeChecked();
    expect(within(third).getByLabelText('Shown')).not.toBeChecked();
    expect(within(third).getByText('Hidden')).toBeInTheDocument();
  });

  it('adds an FAQ at the end of the list', async () => {
    vi.mocked(faqApi.createFaq).mockResolvedValue({
      data: buildFaq({
        id: 'faq-new',
        question: 'Do you offer pick-up?',
        answer: 'Not yet.',
        sort_order: 4,
      }),
      error: null,
    });

    renderPage();
    const user = userEvent.setup();
    await rows();

    await user.type(screen.getByLabelText('Question'), 'Do you offer pick-up?');
    await user.type(screen.getByLabelText('Answer'), 'Not yet.');
    await user.click(screen.getByRole('button', { name: 'Add FAQ' }));

    await waitFor(() =>
      expect(faqApi.createFaq).toHaveBeenCalledWith('token', {
        question: 'Do you offer pick-up?',
        answer: 'Not yet.',
      })
    );

    const updated = await rows();
    expect(updated).toHaveLength(4);
    expect(
      within(updated[3]).getByText('Do you offer pick-up?')
    ).toBeInTheDocument();
    // The form is cleared, ready for the next one.
    expect(screen.getByLabelText('Question')).toHaveValue('');
  });

  it('does not submit an FAQ with a blank question or answer', async () => {
    renderPage();
    const user = userEvent.setup();
    await rows();

    await user.type(screen.getByLabelText('Question'), '   ');
    await user.type(screen.getByLabelText('Answer'), 'An answer.');
    await user.click(screen.getByRole('button', { name: 'Add FAQ' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter both a question and an answer.'
    );
    expect(faqApi.createFaq).not.toHaveBeenCalled();
  });

  it('edits a question and answer in place', async () => {
    renderPage();
    const user = userEvent.setup();
    const [first] = await rows();

    await user.click(within(first).getByRole('button', { name: 'Edit' }));

    const question = within(first).getByLabelText('Question');
    const answer = within(first).getByLabelText('Answer');
    expect(question).toHaveValue('How do I book?');
    expect(answer).toHaveValue('Use Book a Service.');

    await user.clear(question);
    await user.type(question, 'How do I make a booking?');
    await user.click(within(first).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(faqApi.updateFaq).toHaveBeenCalledWith('faq-1', 'token', {
        question: 'How do I make a booking?',
        answer: 'Use Book a Service.',
      })
    );
    expect(
      await screen.findByText('How do I make a booking?')
    ).toBeInTheDocument();
  });

  it('cancelling an edit leaves the FAQ as it was', async () => {
    renderPage();
    const user = userEvent.setup();
    const [first] = await rows();

    await user.click(within(first).getByRole('button', { name: 'Edit' }));
    await user.type(within(first).getByLabelText('Question'), ' changed');
    await user.click(within(first).getByRole('button', { name: 'Cancel' }));

    expect(within(first).getByText('How do I book?')).toBeInTheDocument();
    expect(faqApi.updateFaq).not.toHaveBeenCalled();
  });

  it('hides an FAQ from the mascot with the Shown switch', async () => {
    renderPage();
    const user = userEvent.setup();
    const [first] = await rows();

    await user.click(within(first).getByLabelText('Shown'));

    await waitFor(() =>
      expect(faqApi.updateFaq).toHaveBeenCalledWith('faq-1', 'token', {
        is_active: false,
      })
    );
    expect(await within(first).findByText('Hidden')).toBeInTheDocument();
  });

  it('moves an FAQ down by swapping places with the next one', async () => {
    renderPage();
    const user = userEvent.setup();
    const [first] = await rows();

    await user.click(within(first).getByRole('button', { name: 'Move down' }));

    await waitFor(() => expect(faqApi.updateFaq).toHaveBeenCalledTimes(2));
    expect(faqApi.updateFaq).toHaveBeenCalledWith('faq-1', 'token', {
      sort_order: 2,
    });
    expect(faqApi.updateFaq).toHaveBeenCalledWith('faq-2', 'token', {
      sort_order: 1,
    });

    const [newFirst, newSecond] = await rows();
    expect(within(newFirst).getByText('Can I cancel?')).toBeInTheDocument();
    expect(within(newSecond).getByText('How do I book?')).toBeInTheDocument();
  });

  it('cannot move the first FAQ up or the last one down', async () => {
    renderPage();
    const all = await rows();

    expect(
      within(all[0]).getByRole('button', { name: 'Move up' })
    ).toBeDisabled();
    expect(
      within(all[2]).getByRole('button', { name: 'Move down' })
    ).toBeDisabled();
    expect(
      within(all[1]).getByRole('button', { name: 'Move up' })
    ).toBeEnabled();
  });

  it('deletes an FAQ after confirming', async () => {
    vi.mocked(faqApi.deleteFaq).mockResolvedValue({ error: null });

    renderPage();
    const user = userEvent.setup();
    const [first] = await rows();

    await user.click(within(first).getByRole('button', { name: 'Delete' }));

    // Nothing is deleted until the confirm dialog is accepted.
    expect(faqApi.deleteFaq).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/How do I book\?/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(faqApi.deleteFaq).toHaveBeenCalledWith('faq-1', 'token')
    );
    await waitFor(async () => expect(await rows()).toHaveLength(2));
    expect(screen.queryByText('How do I book?')).not.toBeInTheDocument();
  });

  it("shows the server's reason when a change is refused, and keeps the list", async () => {
    vi.mocked(faqApi.updateFaq).mockResolvedValue({
      data: null,
      error: 'Forbidden',
    });

    renderPage();
    const user = userEvent.setup();
    const [first] = await rows();

    await user.click(within(first).getByLabelText('Shown'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Forbidden');
    expect(within(first).getByLabelText('Shown')).toBeChecked();
  });

  it('says so when there are no FAQs yet', async () => {
    vi.mocked(faqApi.listFaqs).mockResolvedValue({ data: [], error: null });

    renderPage();

    expect(
      await screen.findByText(/No FAQs yet\. Until you add one/)
    ).toBeInTheDocument();
  });
});
