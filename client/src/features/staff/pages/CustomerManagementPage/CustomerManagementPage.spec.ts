import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import {
  listCustomerPets,
  listCustomers,
} from '../../../customers/api/customer.api';
import { listStaff } from '../../api/staff.api';
import { CustomerManagementPage } from './CustomerManagementPage';

vi.mock('../../../../shared/auth/providers/AuthProvider/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../api/staff.api', () => ({
  listStaff: vi.fn(),
}));

vi.mock('../../../customers/api/customer.api', () => ({
  listCustomers: vi.fn(),
  listCustomerPets: vi.fn(),
  createPet: vi.fn(),
  listBreeds: vi.fn(() => Promise.resolve({ data: [], error: null })),
  listPetTypes: vi.fn(() => Promise.resolve({ data: [], error: null })),
  uploadPetPhoto: vi.fn(),
}));

const CUSTOMER = {
  id: 'customer-1',
  full_name: 'Jane Dela Cruz',
  contact_number: '+63 917 000 0001',
  emergency_contact_name: 'John Dela Cruz',
  emergency_contact_number: '+63 917 000 0002',
  preferred_communication_channel: 'Text' as const,
  account_email: 'jane@example.com',
  primary_auth_provider: 'email' as const,
  facebook_id: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

function renderPage() {
  return render(
    createElement(MemoryRouter, null, createElement(CustomerManagementPage))
  );
}

describe('CustomerManagementPage (#76)', () => {
  it('AC-1: is reachable for a Receptionist, renders under the "Customer Management" label, and lists customers', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'staff-1' },
      accessToken: 'token',
    } as never);
    vi.mocked(listStaff).mockResolvedValue({
      data: [{ id: 'staff-1', role: 'Receptionist' }],
      error: null,
    } as never);
    vi.mocked(listCustomers).mockResolvedValue({
      data: [CUSTOMER],
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Customer Management')).toBeInTheDocument();
    expect(await screen.findByText('Jane Dela Cruz')).toBeInTheDocument();
  });

  it('AC-1: redirects a Groomer away from the page', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'staff-1' },
      accessToken: 'token',
    } as never);
    vi.mocked(listStaff).mockResolvedValue({
      data: [{ id: 'staff-1', role: 'Groomer' }],
      error: null,
    } as never);

    renderPage();

    await vi.waitFor(() =>
      expect(screen.queryByText('Customer Management')).not.toBeInTheDocument()
    );
  });

  it('AC-2/AC-3: expanding a row opens the "…" menu, not a create-pet form; Check Profile shows customer details', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'staff-1' },
      accessToken: 'token',
    } as never);
    vi.mocked(listStaff).mockResolvedValue({
      data: [{ id: 'staff-1', role: 'Receptionist' }],
      error: null,
    } as never);
    vi.mocked(listCustomers).mockResolvedValue({
      data: [CUSTOMER],
      error: null,
    });

    renderPage();

    await screen.findByText('Jane Dela Cruz');
    expect(screen.queryByLabelText(/^name$/i)).not.toBeInTheDocument();

    // Gallery/Board (default view) trigger the actions menu via
    // right-click/long-press instead of a visible button - switch to Table,
    // which still has the persistent "..." trigger.
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    fireEvent.click(screen.getByRole('button', { name: /customer actions/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /check profile/i }));

    expect(
      await screen.findByText('John Dela Cruz (+63 917 000 0002)')
    ).toBeInTheDocument();
  });

  it("AC-3/AC-4: View Pets lists the customer's existing pets", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'staff-1' },
      accessToken: 'token',
    } as never);
    vi.mocked(listStaff).mockResolvedValue({
      data: [{ id: 'staff-1', role: 'Receptionist' }],
      error: null,
    } as never);
    vi.mocked(listCustomers).mockResolvedValue({
      data: [CUSTOMER],
      error: null,
    });
    vi.mocked(listCustomerPets).mockResolvedValue({
      data: [
        {
          id: 'pet-1',
          customer_id: 'customer-1',
          name: 'Buddy',
          pet_type: 'Dog',
          breed_id: null,
          photo_url: null,
          gender: null,
          date_of_birth: null,
          weight_class: 'M',
          coat_type: 'SC',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      error: null,
    });

    renderPage();

    await screen.findByText('Jane Dela Cruz');
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    fireEvent.click(screen.getByRole('button', { name: /customer actions/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /view pets/i }));

    expect(await screen.findByText('Buddy')).toBeInTheDocument();
    expect(listCustomerPets).toHaveBeenCalledWith('customer-1', 'token');
    // Issue #76 follow-up: links to the staff-reachable pet route, not
    // /portal/pets/:id (CustomerAuthGuard-gated - would redirect a staff
    // viewer away).
    expect(screen.getByRole('link', { name: /buddy/i })).toHaveAttribute(
      'href',
      '/staff/pets/pet-1'
    );
  });

  it('AC-3: Add Pet opens the create-pet form (one option among several)', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'staff-1' },
      accessToken: 'token',
    } as never);
    vi.mocked(listStaff).mockResolvedValue({
      data: [{ id: 'staff-1', role: 'Receptionist' }],
      error: null,
    } as never);
    vi.mocked(listCustomers).mockResolvedValue({
      data: [CUSTOMER],
      error: null,
    });

    renderPage();

    await screen.findByText('Jane Dela Cruz');
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    fireEvent.click(screen.getByRole('button', { name: /customer actions/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /add pet/i }));

    expect(await screen.findByLabelText(/^name$/i)).toBeInTheDocument();
  });

  it('Notion-style remaster (session 110): a search box narrows the list by name or email', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'staff-1' },
      accessToken: 'token',
    } as never);
    vi.mocked(listStaff).mockResolvedValue({
      data: [{ id: 'staff-1', role: 'Receptionist' }],
      error: null,
    } as never);
    vi.mocked(listCustomers).mockResolvedValue({
      data: [
        CUSTOMER,
        {
          ...CUSTOMER,
          id: 'customer-2',
          full_name: 'Mark Santos',
          account_email: 'mark@example.com',
        },
      ],
      error: null,
    });

    renderPage();

    await screen.findByText('Jane Dela Cruz');
    expect(screen.getByText('Mark Santos')).toBeInTheDocument();

    await userEvent.type(
      screen.getByPlaceholderText('Search customers...'),
      'mark@example.com'
    );

    expect(screen.queryByText('Jane Dela Cruz')).not.toBeInTheDocument();
    expect(screen.getByText('Mark Santos')).toBeInTheDocument();
  });

  it('Notion-style remaster (session 110): a Status filter tile narrows the list to active or inactive customers', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'staff-1' },
      accessToken: 'token',
    } as never);
    vi.mocked(listStaff).mockResolvedValue({
      data: [{ id: 'staff-1', role: 'Receptionist' }],
      error: null,
    } as never);
    vi.mocked(listCustomers).mockResolvedValue({
      data: [
        { ...CUSTOMER, is_active: true },
        {
          ...CUSTOMER,
          id: 'customer-2',
          full_name: 'Mark Santos',
          is_active: false,
        },
      ],
      error: null,
    });

    renderPage();

    await screen.findByText('Jane Dela Cruz');
    expect(screen.getByText('Mark Santos')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Filter' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Status' }));

    // Status defaults to Active once added.
    expect(screen.getByText('Jane Dela Cruz')).toBeInTheDocument();
    expect(screen.queryByText('Mark Santos')).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: /Status: Active/ })
    );
    const dialog = screen.getByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('option', { name: 'Inactive' })
    );

    expect(screen.queryByText('Jane Dela Cruz')).not.toBeInTheDocument();
    expect(screen.getByText('Mark Santos')).toBeInTheDocument();
  });

  it('Notion-style remaster: Gallery is the default view, and Table/List/Board are available alongside it', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'staff-1' },
      accessToken: 'token',
    } as never);
    vi.mocked(listStaff).mockResolvedValue({
      data: [{ id: 'staff-1', role: 'Receptionist' }],
      error: null,
    } as never);
    vi.mocked(listCustomers).mockResolvedValue({
      data: [CUSTOMER],
      error: null,
    });

    renderPage();

    await screen.findByText('Jane Dela Cruz');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Table' }));
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(
      within(screen.getByRole('table')).getByText('Jane Dela Cruz')
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(
      screen.getByText('Jane Dela Cruz').closest('ul')
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Board' }));
    expect(screen.getByText('Jane Dela Cruz')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Gallery' }));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('Jane Dela Cruz')).toBeInTheDocument();
  });

  it('Gallery and Board views have no visible "..." trigger, but right-click opens the actions menu', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'staff-1' },
      accessToken: 'token',
    } as never);
    vi.mocked(listStaff).mockResolvedValue({
      data: [{ id: 'staff-1', role: 'Receptionist' }],
      error: null,
    } as never);
    vi.mocked(listCustomers).mockResolvedValue({
      data: [CUSTOMER],
      error: null,
    });

    renderPage();

    await screen.findByText('Jane Dela Cruz');
    expect(
      screen.queryByRole('button', { name: /customer actions/i })
    ).not.toBeInTheDocument();

    fireEvent.contextMenu(screen.getByText('Jane Dela Cruz'));
    expect(
      screen.getByRole('menuitem', { name: /check profile/i })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: /check profile/i }));
    expect(
      await screen.findByText('John Dela Cruz (+63 917 000 0002)')
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Board' }));
    expect(
      screen.queryByRole('button', { name: /customer actions/i })
    ).not.toBeInTheDocument();

    fireEvent.contextMenu(screen.getByText('Jane Dela Cruz'));
    expect(
      screen.getByRole('menuitem', { name: /view pets/i })
    ).toBeInTheDocument();
  });

  it('Board view groups by Status by default, and a Sort groups control offers Manual/Alphabetical', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'staff-1' },
      accessToken: 'token',
    } as never);
    vi.mocked(listStaff).mockResolvedValue({
      data: [{ id: 'staff-1', role: 'Receptionist' }],
      error: null,
    } as never);
    vi.mocked(listCustomers).mockResolvedValue({
      data: [
        { ...CUSTOMER, is_active: true },
        {
          ...CUSTOMER,
          id: 'customer-2',
          full_name: 'Mark Santos',
          is_active: false,
        },
      ],
      error: null,
    });

    renderPage();

    await screen.findByText('Jane Dela Cruz');
    await userEvent.click(screen.getByRole('button', { name: 'Board' }));

    expect(
      screen.getByRole('heading', { name: /Active/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Inactive/ })
    ).toBeInTheDocument();

    expect(screen.getByLabelText('Sort groups')).toHaveValue('manual');
    await userEvent.selectOptions(
      screen.getByLabelText('Sort groups'),
      'alphabetical'
    );
    expect(screen.getByLabelText('Sort groups')).toHaveValue('alphabetical');

    // A second group-by axis is offered too.
    const groupBySelect = screen.getByLabelText('Group by');
    expect(
      within(groupBySelect).getByRole('option', { name: 'Sign-in method' })
    ).toBeInTheDocument();
  });

  it('Table view: Check Profile from the "..." menu still opens the same detail modal', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'staff-1' },
      accessToken: 'token',
    } as never);
    vi.mocked(listStaff).mockResolvedValue({
      data: [{ id: 'staff-1', role: 'Receptionist' }],
      error: null,
    } as never);
    vi.mocked(listCustomers).mockResolvedValue({
      data: [CUSTOMER],
      error: null,
    });

    renderPage();

    await screen.findByText('Jane Dela Cruz');
    await userEvent.click(screen.getByRole('button', { name: 'Table' }));

    await userEvent.click(
      screen.getByRole('button', { name: /customer actions/i })
    );
    await userEvent.click(
      screen.getByRole('menuitem', { name: /check profile/i })
    );

    expect(
      screen.getByRole('dialog', { name: 'Profile - Jane Dela Cruz' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('John Dela Cruz (+63 917 000 0002)')
    ).toBeInTheDocument();
  });
});
