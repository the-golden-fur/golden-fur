import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import { getPetBookingConflicts } from '../../../booking/api/booking.api';
import {
  archivePet,
  deactivatePet,
  listCustomerPets,
} from '../../api/customer.api';
import type { Pet } from '../../customer.types';
import { CustomerPetManagerPage } from './CustomerPetManagerPage';

vi.mock('../../api/customer.api', () => ({
  listCustomerPets: vi.fn(),
  deactivatePet: vi.fn(),
  archivePet: vi.fn(),
  createPet: vi.fn(),
  uploadPetPhoto: vi.fn(),
  listPetTypes: vi.fn(() => Promise.resolve({ data: [], error: null })),
}));

vi.mock('../../../booking/api/booking.api', () => ({
  getPetBookingConflicts: vi.fn(),
}));

function buildPet(overrides: Partial<Pet> = {}): Pet {
  return {
    id: 'pet-1',
    customer_id: 'customer-1',
    name: 'Bantay',
    pet_type: 'Dog',
    breed_id: null,
    photo_url: null,
    gender: null,
    date_of_birth: null,
    weight_class: 'M',
    coat_type: 'SC',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderPage() {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'customer-1', email: 'customer@example.com' },
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
        createElement(CustomerPetManagerPage)
      )
    )
  );
}

describe('CustomerPetManagerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPetBookingConflicts).mockResolvedValue({
      data: [],
      error: null,
    });
    vi.mocked(deactivatePet).mockResolvedValue({ data: null, error: null });
    vi.mocked(archivePet).mockResolvedValue({ data: null, error: null });
  });

  it('shows an empty state when the customer has no pets', async () => {
    vi.mocked(listCustomerPets).mockResolvedValue({ data: [], error: null });

    renderPage();

    expect(
      await screen.findByText("You haven't added any pets yet.")
    ).toBeInTheDocument();
  });

  it("lists the customer's pets, each linking to its pet profile", async () => {
    vi.mocked(listCustomerPets).mockResolvedValue({
      data: [buildPet({ id: 'pet-1', name: 'Bantay' })],
      error: null,
    });

    renderPage();

    expect(
      await screen.findByRole('link', { name: /bantay/i })
    ).toHaveAttribute('href', '/portal/pets/pet-1');
  });

  it('toggles the Add a pet form open and closed', async () => {
    vi.mocked(listCustomerPets).mockResolvedValue({ data: [], error: null });

    renderPage();
    await screen.findByText("You haven't added any pets yet.");

    await userEvent.click(screen.getByRole('button', { name: 'Add a pet' }));
    expect(screen.getByRole('button', { name: 'Add pet' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(
      screen.queryByRole('button', { name: 'Add pet' })
    ).not.toBeInTheDocument();
  });

  it('searching narrows the visible pets', async () => {
    vi.mocked(listCustomerPets).mockResolvedValue({
      data: [
        buildPet({ id: 'pet-1', name: 'Bantay' }),
        buildPet({ id: 'pet-2', name: 'Whiskers', pet_type: 'Cat' }),
      ],
      error: null,
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Bantay');
    expect(screen.getByText('Whiskers')).toBeInTheDocument();

    await user.type(
      screen.getByPlaceholderText('Search your pets...'),
      'whisk'
    );

    expect(screen.queryByText('Bantay')).not.toBeInTheDocument();
    expect(screen.getByText('Whiskers')).toBeInTheDocument();
  });

  it('a Pet type filter tile narrows the list', async () => {
    vi.mocked(listCustomerPets).mockResolvedValue({
      data: [
        buildPet({ id: 'pet-1', name: 'Bantay', pet_type: 'Cat' }),
        buildPet({ id: 'pet-2', name: 'Whiskers', pet_type: 'Dog' }),
      ],
      error: null,
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Bantay');
    expect(screen.getByText('Whiskers')).toBeInTheDocument();

    // Pet type's default value is the first alphabetical type (Cat).
    await user.click(screen.getByRole('button', { name: 'Filter' }));
    await user.click(screen.getByRole('menuitem', { name: 'Pet type' }));

    expect(screen.getByText('Bantay')).toBeInTheDocument();
    expect(screen.queryByText('Whiskers')).not.toBeInTheDocument();
  });

  it('switches to List and Board (grouped by Pet type by default)', async () => {
    vi.mocked(listCustomerPets).mockResolvedValue({
      data: [
        buildPet({ id: 'pet-1', name: 'Bantay', pet_type: 'Dog' }),
        buildPet({ id: 'pet-2', name: 'Whiskers', pet_type: 'Cat' }),
      ],
      error: null,
    });

    const user = userEvent.setup();
    const { container } = renderPage();

    expect(await screen.findByRole('table')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'List' }));
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getByText('Bantay')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Board' }));
    // One column per pet type (Cat, Dog) - DataBoard's own column sections,
    // not the page's outer panel section.
    expect(container.querySelectorAll('section[class*="column"]')).toHaveLength(
      2
    );
    expect(screen.getByRole('link', { name: /bantay/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /whiskers/i })).toBeInTheDocument();
  });

  it("shows each pet's age from its date of birth, and a dash when there is none", async () => {
    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
    const dateOfBirth = [
      tenYearsAgo.getFullYear(),
      String(tenYearsAgo.getMonth() + 1).padStart(2, '0'),
      String(tenYearsAgo.getDate()).padStart(2, '0'),
    ].join('-');

    vi.mocked(listCustomerPets).mockResolvedValue({
      data: [
        buildPet({ id: 'pet-1', name: 'Bantay', date_of_birth: dateOfBirth }),
        buildPet({ id: 'pet-2', name: 'Whiskers', date_of_birth: null }),
      ],
      error: null,
    });

    renderPage();

    expect(
      await screen.findByRole('columnheader', { name: 'Age' })
    ).toBeInTheDocument();
    const bantayRow = screen.getByText('Bantay').closest('tr')!;
    expect(within(bantayRow).getByText('10 yr')).toBeInTheDocument();
    const whiskersRow = screen.getByText('Whiskers').closest('tr')!;
    expect(within(whiskersRow).queryByText(/yr|mo|day/)).toBeNull();
  });

  it('Delete warns first, then archives the pet and removes it from the list', async () => {
    vi.mocked(listCustomerPets).mockResolvedValue({
      data: [
        buildPet({ id: 'pet-1', name: 'Bantay' }),
        buildPet({ id: 'pet-2', name: 'Whiskers' }),
      ],
      error: null,
    });

    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole('button', { name: 'Delete Bantay' })
    );

    // Nothing happens until the warning is confirmed.
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Delete Bantay?');
    expect(dialog).toHaveTextContent(/Warning/);
    expect(deactivatePet).not.toHaveBeenCalled();

    await user.click(
      within(dialog).getByRole('button', { name: 'Delete pet' })
    );

    expect(await screen.findByText('Pet deleted.')).toBeInTheDocument();
    // The server only archives an inactive pet, so deactivate goes first.
    expect(deactivatePet).toHaveBeenCalledWith('pet-1', 'token');
    expect(archivePet).toHaveBeenCalledWith('pet-1', 'token');
    expect(vi.mocked(deactivatePet).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(archivePet).mock.invocationCallOrder[0]
    );
    expect(screen.queryByText('Bantay')).not.toBeInTheDocument();
    expect(screen.getByText('Whiskers')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('cancelling the delete warning leaves the pet alone', async () => {
    vi.mocked(listCustomerPets).mockResolvedValue({
      data: [buildPet({ id: 'pet-1', name: 'Bantay' })],
      error: null,
    });

    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole('button', { name: 'Delete Bantay' })
    );
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' })
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(deactivatePet).not.toHaveBeenCalled();
    expect(archivePet).not.toHaveBeenCalled();
    expect(screen.getByText('Bantay')).toBeInTheDocument();
  });

  it('a pet with a booking that is not finished cannot be deleted', async () => {
    vi.mocked(listCustomerPets).mockResolvedValue({
      data: [buildPet({ id: 'pet-1', name: 'Bantay' })],
      error: null,
    });
    vi.mocked(getPetBookingConflicts).mockResolvedValue({
      data: [
        {
          pet_id: 'pet-1',
          booking_id: 'booking-1',
          service_category: 'Grooming',
          scheduled_start: '2026-11-01T01:00:00.000Z',
        },
      ],
      error: null,
    });

    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole('button', { name: 'Delete Bantay' })
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      "Bantay has a booking that isn't finished yet. Cancel or complete it before deleting this pet."
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(deactivatePet).not.toHaveBeenCalled();
  });

  it('keeps the pet and shows the error when the delete fails', async () => {
    vi.mocked(listCustomerPets).mockResolvedValue({
      data: [buildPet({ id: 'pet-1', name: 'Bantay' })],
      error: null,
    });
    vi.mocked(archivePet).mockResolvedValue({
      data: null,
      error: 'Something went wrong',
    });

    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole('button', { name: 'Delete Bantay' })
    );
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Delete pet',
      })
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong'
    );
    expect(screen.getByText('Bantay')).toBeInTheDocument();
    expect(screen.queryByText('Pet deleted.')).not.toBeInTheDocument();
  });
});
