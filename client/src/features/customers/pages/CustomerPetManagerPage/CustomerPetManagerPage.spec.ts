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
  listArchivedPets,
  listCustomerPets,
  restorePet,
} from '../../api/customer.api';
import type { Pet } from '../../customer.types';
import { CustomerPetManagerPage } from './CustomerPetManagerPage';

vi.mock('../../api/customer.api', () => ({
  listCustomerPets: vi.fn(),
  deactivatePet: vi.fn(),
  archivePet: vi.fn(),
  listArchivedPets: vi.fn(),
  restorePet: vi.fn(),
  createPet: vi.fn(),
  uploadPetPhoto: vi.fn(),
  listPetTypes: vi.fn(() => Promise.resolve({ data: [], error: null })),
}));

vi.mock('../../../booking/api/booking.api', () => ({
  getPetBookingConflicts: vi.fn(),
}));

// The details modal has its own spec - here it only needs to show which
// booking it was opened for.
vi.mock(
  '../../../booking/components/BookingDetailsModal/BookingDetailsModal',
  () => ({
    BookingDetailsModal: ({ bookingId }: { bookingId: string | null }) =>
      bookingId
        ? createElement('div', { role: 'dialog' }, `Details for ${bookingId}`)
        : null,
  })
);

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
    vi.mocked(listArchivedPets).mockResolvedValue({ data: [], error: null });
    vi.mocked(restorePet).mockResolvedValue({ data: null, error: null });
  });

  describe('archived pets', () => {
    const archived = () =>
      buildPet({
        id: 'pet-9',
        name: 'Mingming',
        is_active: false,
        archived_at: '2026-10-01T00:00:00.000Z',
        archive_reason: 'rehomed',
      } as Partial<Pet>);

    it('hides the section when nothing is archived', async () => {
      vi.mocked(listCustomerPets).mockResolvedValue({
        data: [buildPet({ id: 'pet-1', name: 'Bantay' })],
        error: null,
      });

      renderPage();

      await screen.findByText('Bantay');
      expect(
        screen.queryByRole('button', { name: /Archived pets/ })
      ).not.toBeInTheDocument();
    });

    it('lists archived pets behind a collapsed toggle, with why they were archived', async () => {
      vi.mocked(listCustomerPets).mockResolvedValue({ data: [], error: null });
      vi.mocked(listArchivedPets).mockResolvedValue({
        data: [archived()],
        error: null,
      });

      const user = userEvent.setup();
      renderPage();

      const toggle = await screen.findByRole('button', {
        name: /Archived pets \(1\)/,
      });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByText('Mingming')).not.toBeInTheDocument();
      expect(listArchivedPets).toHaveBeenCalledWith('token', 'customer-1');

      await user.click(toggle);

      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByText('Mingming')).toBeInTheDocument();
      expect(screen.getByText(/Rehomed \/ given away/)).toBeInTheDocument();
    });

    it('Restore brings the pet back onto the roster', async () => {
      vi.mocked(listCustomerPets).mockResolvedValue({
        data: [buildPet({ id: 'pet-1', name: 'Bantay' })],
        error: null,
      });
      vi.mocked(listArchivedPets).mockResolvedValue({
        data: [archived()],
        error: null,
      });

      const user = userEvent.setup();
      renderPage();

      await user.click(
        await screen.findByRole('button', { name: /Archived pets \(1\)/ })
      );
      await user.click(
        screen.getByRole('button', { name: 'Restore Mingming' })
      );

      expect(restorePet).toHaveBeenCalledWith('pet-9', 'token');
      expect(await screen.findByText('Mingming restored.')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /Archived pets/ })
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Archive Mingming' })
      ).toBeInTheDocument();
    });

    it('keeps the pet archived and shows the error when restoring fails', async () => {
      vi.mocked(listCustomerPets).mockResolvedValue({ data: [], error: null });
      vi.mocked(listArchivedPets).mockResolvedValue({
        data: [archived()],
        error: null,
      });
      vi.mocked(restorePet).mockResolvedValue({
        data: null,
        error: 'Something went wrong',
      });

      const user = userEvent.setup();
      renderPage();

      await user.click(
        await screen.findByRole('button', { name: /Archived pets \(1\)/ })
      );
      await user.click(
        screen.getByRole('button', { name: 'Restore Mingming' })
      );

      expect(
        await screen.findByText('Something went wrong')
      ).toBeInTheDocument();
      expect(screen.getByText('Mingming')).toBeInTheDocument();
    });
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

  it('opens the Add a pet form in a popup, closed by Cancel or ×', async () => {
    vi.mocked(listCustomerPets).mockResolvedValue({ data: [], error: null });

    renderPage();
    await screen.findByText("You haven't added any pets yet.");

    await userEvent.click(screen.getByRole('button', { name: 'Add a pet' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a pet' });
    expect(
      within(dialog).getByRole('button', { name: 'Add pet' })
    ).toBeInTheDocument();

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Cancel' })
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Add a pet' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' })
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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

  it('Archive asks first, then archives the pet and moves it to Archived pets', async () => {
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
      await screen.findByRole('button', { name: 'Archive Bantay' })
    );

    // Nothing happens until the warning is confirmed.
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Archive Bantay?');
    expect(dialog).toHaveTextContent(/will move to Archived pets/);
    expect(deactivatePet).not.toHaveBeenCalled();

    // A reason has to be picked before the archive can be confirmed.
    const confirmButton = within(dialog).getByRole('button', {
      name: 'Archive pet',
    });
    expect(confirmButton).toBeDisabled();
    await user.click(
      within(dialog).getByRole('radio', { name: 'Passed away' })
    );
    await user.click(confirmButton);

    expect(
      await screen.findByText(
        'Bantay archived. You can restore it from Archived pets below.'
      )
    ).toBeInTheDocument();
    // The server only archives an inactive pet, so deactivate goes first.
    expect(deactivatePet).toHaveBeenCalledWith('pet-1', 'token');
    expect(archivePet).toHaveBeenCalledWith('pet-1', 'token', {
      reason: 'passed_away',
      reasonOther: null,
    });
    expect(vi.mocked(deactivatePet).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(archivePet).mock.invocationCallOrder[0]
    );
    expect(
      screen.queryByRole('link', { name: /Bantay/ })
    ).not.toBeInTheDocument();
    expect(screen.getByText('Whiskers')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // ...and it is now under Archived pets.
    expect(
      screen.getByRole('button', { name: /Archived pets \(1\)/ })
    ).toBeInTheDocument();
  });

  it('cancelling the archive dialog leaves the pet alone', async () => {
    vi.mocked(listCustomerPets).mockResolvedValue({
      data: [buildPet({ id: 'pet-1', name: 'Bantay' })],
      error: null,
    });

    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole('button', { name: 'Archive Bantay' })
    );
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' })
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(deactivatePet).not.toHaveBeenCalled();
    expect(archivePet).not.toHaveBeenCalled();
    expect(screen.getByText('Bantay')).toBeInTheDocument();
  });

  it('"Other" asks for a custom reason and sends it with the archive', async () => {
    vi.mocked(listCustomerPets).mockResolvedValue({
      data: [buildPet({ id: 'pet-1', name: 'Bantay' })],
      error: null,
    });

    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole('button', { name: 'Archive Bantay' })
    );
    const dialog = screen.getByRole('dialog');
    const confirmButton = within(dialog).getByRole('button', {
      name: 'Archive pet',
    });

    expect(
      within(dialog).queryByRole('textbox', { name: 'Tell us more' })
    ).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('radio', { name: 'Other' }));

    // Picking Other isn't enough - the text can't be blank.
    const otherText = within(dialog).getByRole('textbox', {
      name: 'Tell us more',
    });
    expect(confirmButton).toBeDisabled();
    await user.type(otherText, '   ');
    expect(confirmButton).toBeDisabled();

    await user.type(otherText, 'Moving abroad ');
    expect(confirmButton).toBeEnabled();
    await user.click(confirmButton);

    expect(await screen.findByText(/^Bantay archived\./)).toBeInTheDocument();
    expect(archivePet).toHaveBeenCalledWith('pet-1', 'token', {
      reason: 'other',
      reasonOther: 'Moving abroad',
    });
  });

  it('a pet with a booking that is not finished cannot be archived', async () => {
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
      await screen.findByRole('button', { name: 'Archive Bantay' })
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      "Bantay has a booking that isn't finished yet. Cancel or complete it before archiving this pet."
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(deactivatePet).not.toHaveBeenCalled();
  });

  it("shows a pet's unresolved booking and opens its full details on click", async () => {
    vi.mocked(listCustomerPets).mockResolvedValue({
      data: [
        buildPet({ id: 'pet-1', name: 'Bantay' }),
        buildPet({ id: 'pet-2', name: 'Whiskers' }),
      ],
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

    const bookingButton = await screen.findByRole('button', {
      name: /View Bantay's Grooming booking/,
    });
    // Whiskers has nothing open.
    expect(
      screen.queryByRole('button', { name: /View Whiskers's/ })
    ).not.toBeInTheDocument();

    await user.click(bookingButton);

    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Details for booking-1'
    );
  });

  it('keeps the pet and shows the error when the archive fails', async () => {
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
      await screen.findByRole('button', { name: 'Archive Bantay' })
    );
    await user.click(
      within(screen.getByRole('dialog')).getByRole('radio', {
        name: 'Rehomed / given away',
      })
    );
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Archive pet',
      })
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong'
    );
    expect(screen.getByText('Bantay')).toBeInTheDocument();
    expect(
      screen.queryByText(/archived\. You can restore/)
    ).not.toBeInTheDocument();
  });
});
