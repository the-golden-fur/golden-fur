import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as customerApi from '../../../customers/api/customer.api';
import type {
  CustomerProfile,
  Pet,
  PetTypeRow,
} from '../../../customers/customer.types';
import * as staffApi from '../../../staff/api/staff.api';
import * as vetApi from '../../api/veterinary.api';
import type { VeterinarianPatient } from '../../veterinary.types';
import { MyPatientsPage } from './MyPatientsPage';

vi.mock('../../../staff/api/staff.api', () => ({
  getStaffProfile: vi.fn(),
}));

vi.mock('../../../customers/api/customer.api', () => ({
  getCustomerProfile: vi.fn(),
  getPet: vi.fn(),
  listPetTypes: vi.fn(),
}));

vi.mock('../../api/veterinary.api', () => ({
  listMyPatients: vi.fn(),
  getPetConsultationHistory: vi.fn(),
}));

const DOG_TYPE: PetTypeRow = {
  id: 'pt-1',
  key: 'dog',
  name: 'Dog',
  is_active: true,
  created_at: '',
  updated_at: '',
};

const CAT_TYPE: PetTypeRow = {
  id: 'pt-2',
  key: 'cat',
  name: 'Cat',
  is_active: true,
  created_at: '',
  updated_at: '',
};

function buildPet(overrides: Partial<Pet> = {}): Pet {
  return {
    id: 'pet-1',
    customer_id: 'cust-1',
    name: 'Buddy',
    pet_type: 'dog',
    breed_id: null,
    photo_url: null,
    gender: null,
    date_of_birth: null,
    weight_class: null,
    weight_kg: null,
    coat_type: null,
    assessed_by: null,
    assessed_at: null,
    is_active: true,
    archived_at: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

function buildCustomer(
  overrides: Partial<CustomerProfile> = {}
): CustomerProfile {
  return {
    id: 'cust-1',
    full_name: 'Jane Dela Cruz',
    contact_number: null,
    emergency_contact_name: null,
    emergency_contact_number: null,
    preferred_communication_channel: null,
    account_email: 'jane@example.com',
    primary_auth_provider: 'email',
    facebook_id: null,
    is_active: true,
    archived_at: null,
    deactivated_at: null,
    anonymized_at: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

function renderPage() {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'vet-1', email: 'vet1@example.com' },
    accessToken: 'token',
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut: vi.fn(),
  };

  return render(
    createElement(
      MemoryRouter,
      null,
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(MyPatientsPage)
      )
    )
  );
}

function stubDefaults(
  patients: VeterinarianPatient[],
  pets: Record<string, Pet>,
  owners: Record<string, CustomerProfile>
) {
  vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
    data: { id: 'vet-1', role: 'Veterinarian' } as never,
    error: null,
  });
  vi.mocked(customerApi.listPetTypes).mockResolvedValue({
    data: [DOG_TYPE, CAT_TYPE],
    error: null,
  });
  vi.mocked(vetApi.listMyPatients).mockResolvedValue({
    data: patients,
    error: null,
  });
  vi.mocked(customerApi.getPet).mockImplementation((petId: string) =>
    Promise.resolve({ data: pets[petId] ?? null, error: null })
  );
  vi.mocked(customerApi.getCustomerProfile).mockImplementation(
    (customerId: string) =>
      Promise.resolve({ data: owners[customerId] ?? null, error: null })
  );
}

describe('MyPatientsPage', () => {
  it('redirects a non-Veterinarian role away from the page', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: { id: 'vet-1', role: 'Groomer' } as never,
      error: null,
    });
    vi.mocked(customerApi.listPetTypes).mockResolvedValue({
      data: [],
      error: null,
    });

    renderPage();

    await waitFor(() =>
      expect(screen.queryByText('My Patients')).not.toBeInTheDocument()
    );
  });

  it('lists patients with their owner and last visit date', async () => {
    stubDefaults(
      [
        {
          pet_id: 'pet-1',
          customer_id: 'cust-1',
          last_visit_at: '2026-01-05T00:00:00.000Z',
        },
      ],
      { 'pet-1': buildPet({ name: 'Buddy' }) },
      { 'cust-1': buildCustomer({ full_name: 'Jane Dela Cruz' }) }
    );

    renderPage();

    expect(await screen.findByText('Buddy')).toBeInTheDocument();
    expect(screen.getByText('Jane Dela Cruz')).toBeInTheDocument();
  });

  it('Notion-style remaster (session 110): a search box narrows by pet or owner name', async () => {
    stubDefaults(
      [
        {
          pet_id: 'pet-1',
          customer_id: 'cust-1',
          last_visit_at: '2026-01-05T00:00:00.000Z',
        },
        {
          pet_id: 'pet-2',
          customer_id: 'cust-2',
          last_visit_at: '2026-01-06T00:00:00.000Z',
        },
      ],
      {
        'pet-1': buildPet({
          id: 'pet-1',
          name: 'Buddy',
          customer_id: 'cust-1',
        }),
        'pet-2': buildPet({
          id: 'pet-2',
          name: 'Whiskers',
          customer_id: 'cust-2',
          pet_type: 'cat',
        }),
      },
      {
        'cust-1': buildCustomer({ id: 'cust-1', full_name: 'Jane Dela Cruz' }),
        'cust-2': buildCustomer({ id: 'cust-2', full_name: 'Mark Santos' }),
      }
    );
    const user = userEvent.setup();

    renderPage();

    await screen.findByText('Buddy');
    expect(screen.getByText('Whiskers')).toBeInTheDocument();

    await user.type(
      screen.getByPlaceholderText('Search by pet or owner...'),
      'whiskers'
    );

    expect(screen.queryByText('Buddy')).not.toBeInTheDocument();
    expect(screen.getByText('Whiskers')).toBeInTheDocument();
  });

  it('a Pet Type filter tile narrows the roster', async () => {
    stubDefaults(
      [
        {
          pet_id: 'pet-1',
          customer_id: 'cust-1',
          last_visit_at: '2026-01-05T00:00:00.000Z',
        },
        {
          pet_id: 'pet-2',
          customer_id: 'cust-2',
          last_visit_at: '2026-01-06T00:00:00.000Z',
        },
      ],
      {
        'pet-1': buildPet({
          id: 'pet-1',
          name: 'Buddy',
          customer_id: 'cust-1',
          pet_type: 'dog',
        }),
        'pet-2': buildPet({
          id: 'pet-2',
          name: 'Whiskers',
          customer_id: 'cust-2',
          pet_type: 'cat',
        }),
      },
      {
        'cust-1': buildCustomer({ id: 'cust-1', full_name: 'Jane Dela Cruz' }),
        'cust-2': buildCustomer({ id: 'cust-2', full_name: 'Mark Santos' }),
      }
    );
    const user = userEvent.setup();

    renderPage();

    await screen.findByText('Buddy');
    expect(screen.getByText('Whiskers')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Filter' }));
    await user.click(screen.getByRole('menuitem', { name: 'Pet Type' }));

    // Pet Type defaults to the first pet type option (Dog) once added.
    expect(screen.getByText('Buddy')).toBeInTheDocument();
    expect(screen.queryByText('Whiskers')).not.toBeInTheDocument();
  });

  it('right-click "View History" loads and shows the patient\'s consultation history', async () => {
    stubDefaults(
      [
        {
          pet_id: 'pet-1',
          customer_id: 'cust-1',
          last_visit_at: '2026-01-05T00:00:00.000Z',
        },
      ],
      { 'pet-1': buildPet({ name: 'Buddy' }) },
      { 'cust-1': buildCustomer({ full_name: 'Jane Dela Cruz' }) }
    );
    vi.mocked(vetApi.getPetConsultationHistory).mockResolvedValue({
      data: [],
      error: null,
    });
    const user = userEvent.setup();

    renderPage();

    await screen.findByText('Buddy');
    fireEvent.contextMenu(screen.getByText('Buddy'));
    await user.click(screen.getByRole('menuitem', { name: 'View History' }));

    await waitFor(() =>
      expect(vetApi.getPetConsultationHistory).toHaveBeenCalledWith(
        'pet-1',
        'token'
      )
    );
    expect(
      await screen.findByText('Owner: Jane Dela Cruz')
    ).toBeInTheDocument();
  });

  it('tap-to-hold: no persistent "..." button - right-click/long-press opens the same menu instead', async () => {
    stubDefaults(
      [
        {
          pet_id: 'pet-1',
          customer_id: 'cust-1',
          last_visit_at: '2026-01-05T00:00:00.000Z',
        },
      ],
      { 'pet-1': buildPet({ name: 'Buddy' }) },
      { 'cust-1': buildCustomer({ full_name: 'Jane Dela Cruz' }) }
    );

    renderPage();

    await screen.findByText('Buddy');

    expect(
      screen.queryByRole('button', { name: 'Actions for Buddy' })
    ).not.toBeInTheDocument();

    fireEvent.contextMenu(screen.getByText('Buddy'));
    expect(
      screen.getByRole('menuitem', { name: 'View History' })
    ).toBeInTheDocument();
  });
});
