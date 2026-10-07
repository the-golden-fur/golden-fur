import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
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
  listPetPrescriptions: vi.fn(),
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

  it('the View history button on a patient loads and shows their consultation history', async () => {
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
    expect(screen.queryByText(/Right-click/)).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'View history for Buddy' })
    );

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

  describe('View prescription', () => {
    const ONE_PATIENT = [
      {
        pet_id: 'pet-1',
        customer_id: 'cust-1',
        last_visit_at: '2026-01-05T00:00:00.000Z',
      },
    ];

    async function openPrescriptions() {
      stubDefaults(
        ONE_PATIENT,
        { 'pet-1': buildPet({ name: 'Buddy' }) },
        { 'cust-1': buildCustomer({ full_name: 'Jane Dela Cruz' }) }
      );
      const user = userEvent.setup();

      renderPage();

      await screen.findByText('Buddy');
      await user.click(
        screen.getByRole('button', { name: 'View prescription for Buddy' })
      );

      return {
        user,
        panel: await screen.findByRole('region', { name: 'Buddy details' }),
      };
    }

    it('opens the side panel on its Prescriptions tab, shows the medicine details and prints the sheet', async () => {
      vi.mocked(customerApi.listPetPrescriptions).mockResolvedValue({
        data: [
          {
            consultation_id: 'consultation-1',
            date: '2026-01-05T02:00:00.000Z',
            veterinarian_name: 'Dr. Reyes',
            branch_name: 'Golden Fur Makati',
            branch_address: '123 Ayala Ave, Makati',
            pet_name: 'Buddy',
            owner_name: 'Jane Dela Cruz',
            medications: [
              {
                name: 'Amoxicillin',
                dose: '50mg',
                medicine_type: 'Oral',
                strength: '250 mg',
                notes: 'After meals',
                quantity_unit: 'capsules',
                refills: 1,
                frequency: 'Twice daily',
                duration: '7 days',
                quantity: 14,
              },
            ],
          },
        ],
        error: null,
      });
      const print = vi.spyOn(window, 'print').mockImplementation(() => {});

      const { user, panel: dialog } = await openPrescriptions();

      // A panel beside the list, not a pop-up.
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(
        within(dialog).getByRole('tab', { name: 'Prescriptions' })
      ).toHaveAttribute('aria-selected', 'true');

      expect(customerApi.listPetPrescriptions).toHaveBeenCalledWith(
        'pet-1',
        'token'
      );
      const row = await within(dialog).findByRole('row', {
        name: /Amoxicillin/,
      });
      for (const detail of [
        '250 mg',
        'Oral',
        '14 capsules',
        '50mg',
        'After meals',
        'Twice daily',
        '7 days',
      ]) {
        expect(within(row).getByText(detail)).toBeInTheDocument();
      }
      expect(
        within(dialog).getByText(/Prescribed by Dr. Reyes/)
      ).toBeInTheDocument();

      await user.click(
        within(dialog).getByRole('button', { name: 'Print prescription' })
      );

      expect(print).toHaveBeenCalledTimes(1);
      // The letterheaded sheet is what gets printed.
      expect(
        screen.getByRole('document', { name: 'Prescription' })
      ).toBeInTheDocument();

      print.mockRestore();
    });

    it('is offered even for a patient with no prescription, and says so', async () => {
      vi.mocked(customerApi.listPetPrescriptions).mockResolvedValue({
        data: [],
        error: null,
      });

      const { panel: dialog } = await openPrescriptions();

      expect(
        await within(dialog).findByText(
          'No prescription has been written for Buddy yet.'
        )
      ).toBeInTheDocument();
      expect(
        within(dialog).queryByRole('button', { name: 'Print prescription' })
      ).not.toBeInTheDocument();
    });

    it('History and Prescriptions are tabs of the same panel, which the X closes', async () => {
      vi.mocked(customerApi.listPetPrescriptions).mockResolvedValue({
        data: [],
        error: null,
      });
      vi.mocked(vetApi.getPetConsultationHistory).mockResolvedValue({
        data: [],
        error: null,
      });

      const { user, panel } = await openPrescriptions();

      await user.click(within(panel).getByRole('tab', { name: 'History' }));
      expect(
        within(panel).getByRole('tab', { name: 'History' })
      ).toHaveAttribute('aria-selected', 'true');
      expect(
        within(panel).queryByText(
          'No prescription has been written for Buddy yet.'
        )
      ).not.toBeInTheDocument();

      await user.click(
        within(panel).getByRole('button', { name: 'Close panel' })
      );
      expect(
        screen.queryByRole('region', { name: 'Buddy details' })
      ).not.toBeInTheDocument();
    });
  });

  it('switches between List, Table and Grid views, each with the same patient actions', async () => {
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
    const user = userEvent.setup();

    renderPage();
    await screen.findByText('Buddy');

    await user.click(screen.getByRole('button', { name: 'Table' }));
    expect(
      screen.getByRole('columnheader', { name: 'Last visit' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'View prescription for Buddy' })
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Grid' }));
    expect(screen.queryByRole('columnheader')).not.toBeInTheDocument();
    expect(screen.getByText('Buddy')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'View history for Buddy' })
    ).toBeInTheDocument();
  });
});
