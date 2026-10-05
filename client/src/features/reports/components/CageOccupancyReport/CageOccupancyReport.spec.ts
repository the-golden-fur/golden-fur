import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../../staff/api/staff.api';
import type { StaffProfile, StaffRole } from '../../../staff/staff.types';
import * as maintenanceApi from '../../../maintenance/api/maintenance.api';
import * as hotelApi from '../../../hotel/api/hotel.api';
import * as daycareApi from '../../../daycare/api/daycare.api';
import type { Cage } from '../../../hotel/hotel.types';
import * as reportsApi from '../../api/reports.api';
import { CageOccupancyReport } from './CageOccupancyReport';

vi.mock('../../../staff/api/staff.api', () => ({
  listStaff: vi.fn(),
}));

vi.mock('../../../maintenance/api/maintenance.api', () => ({
  listBranches: vi.fn(),
}));

vi.mock('../../../hotel/api/hotel.api', () => ({
  getCageGrid: vi.fn(),
  getCageOccupants: vi.fn(),
  checkOutHotelStay: vi.fn(),
}));

vi.mock('../../../daycare/api/daycare.api', () => ({
  checkOutDaycareSession: vi.fn(),
}));

vi.mock('../../api/reports.api', () => ({
  getCageOccupancyReport: vi.fn(),
}));

function buildViewer(
  role: StaffRole,
  overrides: Partial<StaffProfile> = {}
): StaffProfile {
  return {
    id: 'staff-1',
    branch_id: 'branch-makati',
    role,
    username: 'receptionist',
    registered_email: 'staff@example.com',
    display_name: 'Front Desk',
    profile_photo_url: null,
    phone_number: null,
    emergency_contact_name: null,
    emergency_contact_number: null,
    preferred_communication_channel: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function buildCage(overrides: Partial<Cage> = {}): Cage {
  return {
    id: 'cage-1',
    branch_id: 'branch-makati',
    cage_label: 'S-01',
    size: 'S',
    status: 'Available',
    pet_types: ['Dog'],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
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
      { initialEntries: ['/staff/reports/cage-occupancy'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/staff/reports/cage-occupancy',
            element: createElement(CageOccupancyReport),
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

describe('CageOccupancyReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(maintenanceApi.listBranches).mockResolvedValue({
      data: [{ id: 'branch-makati', name: 'Makati', is_vet_branch: true }],
      error: null,
    });
    vi.mocked(reportsApi.getCageOccupancyReport).mockResolvedValue({
      data: [{ size: 'S', status: 'Available', cage_count: 3 }],
      error: null,
    });
    vi.mocked(hotelApi.getCageGrid).mockResolvedValue({
      data: {
        S: [
          buildCage({ id: 'cage-1', cage_label: 'S-01', status: 'Available' }),
          buildCage({ id: 'cage-2', cage_label: 'S-02', status: 'Occupied' }),
        ],
        M: [buildCage({ id: 'cage-3', cage_label: 'M-01', size: 'M' })],
        L: [],
        XL: [],
      },
      error: null,
    });
    // Nobody in any cage unless a test says otherwise.
    vi.mocked(hotelApi.getCageOccupants).mockResolvedValue({
      data: [],
      error: null,
    });
  });

  describe('checkout countdown on an occupied cage', () => {
    beforeEach(() => {
      vi.mocked(staffApi.listStaff).mockResolvedValue({
        data: [buildViewer('Receptionist')],
        error: null,
      });
    });

    function occupant(expectedCheckoutAt: string | null) {
      return {
        stay_id: 'stay-1',
        cage_id: 'cage-2',
        pet_name: 'Mochi',
        owner_name: 'Jamie Cruz',
        service: 'Daycare' as const,
        booking_id: expectedCheckoutAt ? 'booking-1' : null,
        since: '2026-08-01T02:00:00.000Z',
        expected_checkout_at: expectedCheckoutAt,
      };
    }

    it('shows who is in the cage and how long until the expected checkout', async () => {
      const inTwoHours = new Date(
        Date.now() + 2 * 60 * 60 * 1000 + 30_000
      ).toISOString();
      vi.mocked(hotelApi.getCageOccupants).mockResolvedValue({
        data: [occupant(inTwoHours)],
        error: null,
      });

      renderPage();

      expect(await screen.findByText('Mochi')).toBeInTheDocument();
      expect(screen.getByText('Daycare')).toBeInTheDocument();
      expect(
        screen.getByText(/^Checkout in 2h 00m \d\ds$/)
      ).toBeInTheDocument();
    });

    it('says on the card whether the stay is paid or pays at checkout', async () => {
      const inTwoHours = new Date(
        Date.now() + 2 * 60 * 60 * 1000 + 30_000
      ).toISOString();
      vi.mocked(hotelApi.getCageOccupants).mockResolvedValue({
        data: [{ ...occupant(inTwoHours), payment: 'pay_at_checkout' }],
        error: null,
      });

      renderPage();

      expect(await screen.findByText('Mochi')).toBeInTheDocument();
      expect(screen.getByText('Pay at checkout')).toBeInTheDocument();
    });

    it('shows Paid for a fully paid stay', async () => {
      const inTwoHours = new Date(
        Date.now() + 2 * 60 * 60 * 1000 + 30_000
      ).toISOString();
      vi.mocked(hotelApi.getCageOccupants).mockResolvedValue({
        data: [{ ...occupant(inTwoHours), payment: 'paid' }],
        error: null,
      });

      renderPage();

      expect(await screen.findByText('Paid')).toBeInTheDocument();
    });

    it('flags a pet that is past its expected checkout as overdue', async () => {
      const fortyMinutesAgo = new Date(
        Date.now() - 40 * 60 * 1000 - 5_000
      ).toISOString();
      vi.mocked(hotelApi.getCageOccupants).mockResolvedValue({
        data: [occupant(fortyMinutesAgo)],
        error: null,
      });

      renderPage();

      expect(
        await screen.findByText(/^Overdue by 40m \d\ds$/)
      ).toBeInTheDocument();
    });

    it('shows the overdue fee a Daycare pet has run up so far', async () => {
      const fortyMinutesAgo = new Date(
        Date.now() - 40 * 60 * 1000 - 5_000
      ).toISOString();
      vi.mocked(hotelApi.getCageOccupants).mockResolvedValue({
        data: [
          {
            ...occupant(fortyMinutesAgo),
            overdue_fee_per_hour: 50,
            overdue_grace_minutes: 15,
          },
        ],
        error: null,
      });

      renderPage();

      expect(
        await screen.findByText(/^Overdue by 40m \d\ds · ₱50 overdue fee$/)
      ).toBeInTheDocument();
    });

    it('says so when a walk-in session has no expected checkout', async () => {
      vi.mocked(hotelApi.getCageOccupants).mockResolvedValue({
        data: [occupant(null)],
        error: null,
      });

      renderPage();

      expect(
        await screen.findByText('No expected checkout (walk-in)')
      ).toBeInTheDocument();
      expect(screen.queryByText(/^Checkout in/)).not.toBeInTheDocument();
    });

    it('ignores an occupant entry for a cage that is not Occupied', async () => {
      vi.mocked(hotelApi.getCageOccupants).mockResolvedValue({
        data: [{ ...occupant('2026-08-01T06:00:00.000Z'), cage_id: 'cage-1' }],
        error: null,
      });

      renderPage();

      expect(await screen.findByText('S-01')).toBeInTheDocument();
      expect(screen.queryByText('Mochi')).not.toBeInTheDocument();
    });

    describe('cage details popup', () => {
      it('clicking an occupied cage opens its details: cage, occupant, expected checkout and a countdown', async () => {
        const user = userEvent.setup();
        const inTwoHours = new Date(
          Date.now() + 2 * 60 * 60 * 1000 + 30_000
        ).toISOString();
        vi.mocked(hotelApi.getCageOccupants).mockResolvedValue({
          data: [occupant(inTwoHours)],
          error: null,
        });

        renderPage();

        await user.click(await screen.findByRole('button', { name: /S-02/ }));

        const dialog = screen.getByRole('dialog', { name: 'Cage S-02' });
        expect(dialog).toHaveTextContent('Occupied');
        expect(dialog).toHaveTextContent('Small');
        expect(within(dialog).getByText('Mochi')).toBeInTheDocument();
        expect(within(dialog).getByText('Jamie Cruz')).toBeInTheDocument();
        expect(within(dialog).getByText('Daycare')).toBeInTheDocument();
        expect(within(dialog).getByText('Expected checkout')).toBeVisible();
        expect(
          within(dialog).getByText(/^Checkout in 2h 00m \d\ds$/)
        ).toBeInTheDocument();
        expect(
          within(dialog).getByRole('link', { name: 'View booking' })
        ).toHaveAttribute('href', '/staff/bookings/booking-1');
      });

      it('an empty cage opens too, saying nobody is in it and offering no Check out', async () => {
        const user = userEvent.setup();

        renderPage();

        await user.click(await screen.findByRole('button', { name: /S-01/ }));

        const dialog = screen.getByRole('dialog', { name: 'Cage S-01' });
        expect(dialog).toHaveTextContent('No pet is in this cage.');
        expect(
          within(dialog).queryByRole('button', { name: 'Check out' })
        ).not.toBeInTheDocument();
      });

      it('closes from its close button', async () => {
        const user = userEvent.setup();

        renderPage();

        await user.click(await screen.findByRole('button', { name: /S-01/ }));
        await user.click(screen.getByRole('button', { name: 'Close' }));

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    describe('Check out', () => {
      const inTwoHours = () =>
        new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

      /** Check out lives in the cage's details popup: open the occupied
       * cage (S-02), press Check out there - the popup hands over to the
       * confirm dialog, so only one dialog is ever open. */
      async function openCheckoutFromCage(
        user: ReturnType<typeof userEvent.setup>
      ) {
        await user.click(await screen.findByRole('button', { name: /S-02/ }));
        await user.click(
          within(screen.getByRole('dialog', { name: 'Cage S-02' })).getByRole(
            'button',
            { name: 'Check out' }
          )
        );
      }

      it('checks a Daycare pet out after confirming, then reloads so the cage reads Available', async () => {
        const user = userEvent.setup();
        vi.mocked(hotelApi.getCageOccupants).mockResolvedValue({
          data: [occupant(inTwoHours())],
          error: null,
        });
        vi.mocked(daycareApi.checkOutDaycareSession).mockResolvedValue({
          data: { id: 'stay-1', computed_charge: 150 } as never,
          error: null,
        });

        renderPage();

        await openCheckoutFromCage(user);
        // Nothing happens until the dialog is confirmed.
        expect(daycareApi.checkOutDaycareSession).not.toHaveBeenCalled();
        const dialog = screen.getByRole('dialog');
        expect(dialog).toHaveTextContent('sets S-02 back to Available');

        const reloadsBefore = vi.mocked(hotelApi.getCageGrid).mock.calls.length;
        await user.click(
          within(dialog).getByRole('button', { name: 'Check out' })
        );

        expect(daycareApi.checkOutDaycareSession).toHaveBeenCalledWith(
          'stay-1',
          'token'
        );
        expect(
          await screen.findByText(
            'Mochi was checked out and S-02 is available again. Daycare charge: PHP 150.00.'
          )
        ).toBeInTheDocument();
        await waitFor(() =>
          expect(
            vi.mocked(hotelApi.getCageGrid).mock.calls.length
          ).toBeGreaterThan(reloadsBefore)
        );
        expect(hotelApi.checkOutHotelStay).not.toHaveBeenCalled();
      });

      it('uses the Hotel check-out for a Hotel stay', async () => {
        const user = userEvent.setup();
        vi.mocked(hotelApi.getCageOccupants).mockResolvedValue({
          data: [{ ...occupant(inTwoHours()), service: 'Hotel' as const }],
          error: null,
        });
        vi.mocked(hotelApi.checkOutHotelStay).mockResolvedValue({
          data: {
            stay: { id: 'stay-1' },
            downpaymentAmount: 0,
            extensionFee: null,
            remainingBalance: 850,
          } as never,
          error: null,
        });

        renderPage();

        await openCheckoutFromCage(user);
        await user.click(
          within(screen.getByRole('dialog')).getByRole('button', {
            name: 'Check out',
          })
        );

        expect(hotelApi.checkOutHotelStay).toHaveBeenCalledWith(
          'stay-1',
          'token'
        );
        expect(
          await screen.findByText(/Remaining balance: PHP 850.00/)
        ).toBeInTheDocument();
      });

      it("keeps the dialog open with the server's reason when the check-out is refused", async () => {
        const user = userEvent.setup();
        vi.mocked(hotelApi.getCageOccupants).mockResolvedValue({
          data: [occupant(inTwoHours())],
          error: null,
        });
        vi.mocked(daycareApi.checkOutDaycareSession).mockResolvedValue({
          data: null,
          error: 'Complete the boarding checklist before checking out',
        });

        renderPage();

        await openCheckoutFromCage(user);
        await user.click(
          within(screen.getByRole('dialog')).getByRole('button', {
            name: 'Check out',
          })
        );

        expect(
          await within(screen.getByRole('dialog')).findByText(
            'Complete the boarding checklist before checking out'
          )
        ).toBeInTheDocument();
        expect(
          screen.queryByText(/is available again/)
        ).not.toBeInTheDocument();
      });
    });

    it('still lists the cages when the occupant lookup fails', async () => {
      vi.mocked(hotelApi.getCageOccupants).mockResolvedValue({
        data: null,
        error: 'boom',
      });

      renderPage();

      expect(await screen.findByText('S-02')).toBeInTheDocument();
      expect(screen.queryByText(/^Checkout in/)).not.toBeInTheDocument();
    });
  });

  // Bug fix: a Superadmin's Branch selector used to change only the summary
  // counts - the cage list below always showed their own branch.
  describe('Superadmin sees cages on every branch', () => {
    const TWO_BRANCH_GRID = {
      S: [
        buildCage({ id: 'cage-1', cage_label: 'S-01' }),
        buildCage({
          id: 'cage-9',
          cage_label: 'SW-S-01',
          branch_id: 'branch-southwoods',
          status: 'Occupied',
        }),
      ],
      M: [],
      L: [],
      XL: [],
    };

    beforeEach(() => {
      vi.mocked(staffApi.listStaff).mockResolvedValue({
        data: [buildViewer('Superadmin')],
        error: null,
      });
      vi.mocked(maintenanceApi.listBranches).mockResolvedValue({
        data: [
          { id: 'branch-makati', name: 'Makati', is_vet_branch: true },
          {
            id: 'branch-southwoods',
            name: 'Southwoods',
            is_vet_branch: false,
          },
        ],
        error: null,
      });
      vi.mocked(hotelApi.getCageGrid).mockResolvedValue({
        data: TWO_BRANCH_GRID,
        error: null,
      });
    });

    it("loads the cages and occupants of all branches by default, and names each cage's branch", async () => {
      renderPage();

      const otherBranchCage = await screen.findByRole('button', {
        name: /^SW-S-01 - Occupied/,
      });

      expect(hotelApi.getCageGrid).toHaveBeenLastCalledWith('token', 'all');
      expect(hotelApi.getCageOccupants).toHaveBeenLastCalledWith(
        'token',
        'all'
      );
      expect(
        within(otherBranchCage).getByText('Southwoods')
      ).toBeInTheDocument();
      expect(
        within(
          screen.getByRole('button', { name: /^S-01 - Available/ })
        ).getByText('Makati')
      ).toBeInTheDocument();
    });

    it('loads only the chosen branch when one is picked', async () => {
      renderPage();
      await screen.findByText('S-01');

      await userEvent.selectOptions(
        screen.getByLabelText('Branch'),
        'branch-southwoods'
      );

      await waitFor(() =>
        expect(hotelApi.getCageGrid).toHaveBeenLastCalledWith(
          'token',
          'branch-southwoods'
        )
      );
      expect(hotelApi.getCageOccupants).toHaveBeenLastCalledWith(
        'token',
        'branch-southwoods'
      );
    });

    it("offers no Check out for a pet at another branch - that stays with the branch's own staff", async () => {
      vi.mocked(hotelApi.getCageOccupants).mockResolvedValue({
        data: [
          {
            stay_id: 'stay-9',
            cage_id: 'cage-9',
            pet_name: 'Mochi',
            owner_name: 'Jamie Cruz',
            service: 'Hotel',
            booking_id: 'booking-9',
            since: '2026-08-01T02:00:00.000Z',
            expected_checkout_at: null,
            overdue_fee_per_hour: null,
            overdue_grace_minutes: null,
            payment: 'paid',
          },
        ],
        error: null,
      });

      renderPage();
      await userEvent.click(
        await screen.findByRole('button', { name: /^SW-S-01 - Occupied/ })
      );

      const dialog = await screen.findByRole('dialog', {
        name: 'Cage SW-S-01',
      });
      expect(within(dialog).getByText('Mochi')).toBeInTheDocument();
      expect(
        within(dialog).queryByRole('button', { name: 'Check out' })
      ).not.toBeInTheDocument();
      expect(
        within(dialog).getByText(/checked out by Southwoods staff/)
      ).toBeInTheDocument();
    });
  });

  it('a Receptionist only ever loads their own branch', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Receptionist')],
      error: null,
    });

    renderPage();
    await screen.findByText('S-01');

    expect(hotelApi.getCageGrid).toHaveBeenLastCalledWith('token', undefined);
    expect(hotelApi.getCageOccupants).toHaveBeenLastCalledWith(
      'token',
      undefined
    );
    // No branch name on a card when there is only one branch in view.
    expect(screen.queryByText('Makati')).not.toBeInTheDocument();
  });

  it('redirects a viewer with no access at all to Settings', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Groomer')],
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Settings page')).toBeInTheDocument();
  });

  it('lets a Receptionist view the page and its individual cage list', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Receptionist')],
      error: null,
    });

    renderPage();

    expect(await screen.findByText('S-01')).toBeInTheDocument();
    expect(screen.getByText('S-02')).toBeInTheDocument();
    expect(screen.getByText('M-01')).toBeInTheDocument();
    expect(screen.getByText('3 of 3 cages')).toBeInTheDocument();
  });

  it('searches individual cages by label', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Receptionist')],
      error: null,
    });

    renderPage();
    await screen.findByText('S-01');

    await userEvent.type(
      screen.getByPlaceholderText('Search by cage label...'),
      'M-01'
    );

    await waitFor(() => {
      expect(screen.queryByText('S-01')).not.toBeInTheDocument();
      expect(screen.getByText('M-01')).toBeInTheDocument();
    });
    expect(screen.getByText('1 of 3 cages')).toBeInTheDocument();
  });

  it('filters individual cages by status', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Receptionist')],
      error: null,
    });

    renderPage();
    await screen.findByText('S-01');

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'Occupied');

    await waitFor(() => {
      expect(screen.queryByText('S-01')).not.toBeInTheDocument();
      expect(screen.getByText('S-02')).toBeInTheDocument();
    });
    expect(screen.getByText('1 of 3 cages')).toBeInTheDocument();
  });

  it('filters individual cages by size', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Receptionist')],
      error: null,
    });

    renderPage();
    await screen.findByText('S-01');

    await userEvent.selectOptions(screen.getByLabelText('Size'), 'Medium');

    await waitFor(() => {
      expect(screen.queryByText('S-01')).not.toBeInTheDocument();
      expect(screen.getByText('M-01')).toBeInTheDocument();
    });
    expect(screen.getByText('1 of 3 cages')).toBeInTheDocument();
  });

  it('sorts individual cages by status', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Receptionist')],
      error: null,
    });

    renderPage();
    await screen.findByText('S-01');

    await userEvent.selectOptions(
      screen.getByDisplayValue('Sort: Label (A-Z)'),
      'status'
    );

    const labels = screen
      .getAllByText(/^(S-01|S-02|M-01)$/)
      .map((el) => el.textContent);
    // Available (S-01) sorts before Occupied (S-02) alphabetically. M-01 is
    // in its own size column, so it isn't ordered against the Small cages.
    expect(labels.indexOf('S-02')).toBeGreaterThan(labels.indexOf('S-01'));
  });

  it('sorts by checkout due, putting the occupied cage above the empty ones', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Receptionist')],
      error: null,
    });
    vi.mocked(hotelApi.getCageOccupants).mockResolvedValue({
      data: [
        {
          stay_id: 'stay-1',
          cage_id: 'cage-2',
          pet_name: 'Mochi',
          owner_name: 'Jamie Cruz',
          service: 'Hotel',
          booking_id: 'booking-1',
          since: '2026-08-01T02:00:00.000Z',
          expected_checkout_at: new Date(
            Date.now() + 2 * 60 * 60 * 1000
          ).toISOString(),
          overdue_fee_per_hour: null,
          overdue_grace_minutes: null,
          payment: 'paid',
        },
      ],
      error: null,
    });

    renderPage();
    await screen.findByText('Mochi');

    await userEvent.selectOptions(
      screen.getByDisplayValue('Sort: Label (A-Z)'),
      'checkout-soonest'
    );

    const labels = screen
      .getAllByText(/^(S-01|S-02|M-01)$/)
      .map((el) => el.textContent);
    expect(labels[0]).toBe('S-02');
  });

  describe('columns by size layout', () => {
    beforeEach(() => {
      vi.mocked(staffApi.listStaff).mockResolvedValue({
        data: [buildViewer('Receptionist')],
        error: null,
      });
    });

    it('lays the cages out with one column per size', async () => {
      renderPage();
      await screen.findByText('S-01');

      // Columns by size is the only layout - there is no layout switch.
      expect(screen.queryByLabelText('Layout')).not.toBeInTheDocument();

      const small = screen.getByRole('region', { name: /^Small cages/ });
      expect(within(small).getByText('S-01')).toBeInTheDocument();
      expect(within(small).getByText('S-02')).toBeInTheDocument();
      expect(within(small).queryByText('M-01')).not.toBeInTheDocument();

      const medium = screen.getByRole('region', { name: /^Medium cages/ });
      expect(within(medium).getByText('M-01')).toBeInTheDocument();

      // A size with no cages keeps its column and says so.
      const large = screen.getByRole('region', { name: /^Large cages/ });
      expect(within(large).getByText('No cages')).toBeInTheDocument();
      expect(
        screen.getByRole('region', { name: /^Extra Large cages/ })
      ).toBeInTheDocument();
    });

    it('keeps the chosen sort inside each column', async () => {
      renderPage();
      await screen.findByText('S-01');

      await userEvent.selectOptions(
        screen.getByDisplayValue('Sort: Label (A-Z)'),
        'status'
      );

      const small = screen.getByRole('region', { name: /^Small cages/ });
      const labels = within(small)
        .getAllByText(/^S-0\d$/)
        .map((el) => el.textContent);
      // Available (S-01) before Occupied (S-02).
      expect(labels).toEqual(['S-01', 'S-02']);
    });

    it('shows only the chosen size column when filtering by size', async () => {
      renderPage();
      await screen.findByText('S-01');

      await userEvent.selectOptions(screen.getByLabelText('Size'), 'M');

      expect(
        screen.getByRole('region', { name: /^Medium cages/ })
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('region', { name: /^Small cages/ })
      ).not.toBeInTheDocument();
    });

    it('a cage in a column still opens its details', async () => {
      renderPage();
      await screen.findByText('S-01');

      await userEvent.click(
        screen.getByRole('button', { name: /^M-01 - Available/ })
      );

      expect(
        await screen.findByRole('dialog', { name: 'Cage M-01' })
      ).toBeInTheDocument();
    });
  });
});
