import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as hotelApi from '../../../hotel/api/hotel.api';
import * as maintenanceApi from '../../../maintenance/api/maintenance.api';
import * as catalogApi from '../../../catalog/api/catalog.api';
import * as staffApi from '../../api/staff.api';
import { AdminArchivePage } from './AdminArchivePage';

vi.mock('../../api/staff.api', () => ({
  listStaff: vi.fn(),
  listArchivedStaff: vi.fn(),
  restoreStaffAccount: vi.fn(),
  hardDeleteStaffAccount: vi.fn(),
}));

vi.mock('../../../hotel/api/hotel.api', () => ({
  listArchivedCages: vi.fn(),
  restoreCage: vi.fn(),
  hardDeleteCage: vi.fn(),
}));

vi.mock('../../../maintenance/api/maintenance.api', () => ({
  hardDeleteBreedAdmin: vi.fn(),
  hardDeletePackage: vi.fn(),
  hardDeletePetType: vi.fn(),
  hardDeletePromo: vi.fn(),
  hardDeleteService: vi.fn(),
  hardDeleteServiceType: vi.fn(),
  listArchivedBreedsAdmin: vi.fn(),
  listArchivedPackages: vi.fn(),
  listArchivedPetTypes: vi.fn(),
  listArchivedPromos: vi.fn(),
  listArchivedServices: vi.fn(),
  listArchivedServiceTypes: vi.fn(),
  restoreBreedAdmin: vi.fn(),
  restorePackage: vi.fn(),
  restorePetType: vi.fn(),
  restorePromo: vi.fn(),
  restoreService: vi.fn(),
  restoreServiceType: vi.fn(),
}));

vi.mock('../../../maintenance/api/branches.api', () => ({
  hardDeleteBranch: vi.fn(),
  listArchivedBranches: vi.fn(),
  restoreBranch: vi.fn(),
}));

vi.mock('../../../catalog/api/catalog.api', () => ({
  hardDeleteProduct: vi.fn(),
  listArchivedProducts: vi.fn(),
  restoreProduct: vi.fn(),
}));

vi.mock('../../../customers/api/customer.api', () => ({
  hardDeleteCustomer: vi.fn(),
  hardDeletePet: vi.fn(),
  listArchivedCustomers: vi.fn(),
  listArchivedPets: vi.fn(),
  restoreCustomer: vi.fn(),
  restorePet: vi.fn(),
}));

vi.mock('../../../discounts/api/discounts.api', () => ({
  hardDeleteDiscount: vi.fn(),
  listArchivedDiscounts: vi.fn(),
  restoreDiscount: vi.fn(),
}));

vi.mock('../../../rewards/api/rewards.api', () => ({
  hardDeleteRewardPool: vi.fn(),
  hardDeleteSpinWheelReward: vi.fn(),
  listArchivedRewardPools: vi.fn(),
  listArchivedSpinWheelRewards: vi.fn(),
  restoreRewardPool: vi.fn(),
  restoreSpinWheelReward: vi.fn(),
}));

vi.mock(
  '../../components/DeletedRecordsArchiveList/DeletedRecordsArchiveList',
  () => ({
    DeletedRecordsArchiveList: () =>
      createElement('div', null, 'deleted records'),
  })
);

function renderPage(tab?: string) {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'staff-1', email: 'admin@example.com' },
    accessToken: 'token',
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut: vi.fn(),
  };

  return render(
    createElement(
      MemoryRouter,
      { initialEntries: [`/archive${tab ? `?tab=${tab}` : ''}`] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/archive',
            element: createElement(AdminArchivePage),
          }),
          createElement(Route, {
            path: '/staff/settings',
            element: createElement('div', null, 'Staff profile page'),
          })
        )
      )
    )
  );
}

describe('AdminArchivePage (Config-menu consistency change)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [{ id: 'staff-1', role: 'Admin' } as never],
      error: null,
    });
    // The default (Products) tab loads first - every other tab is stubbed
    // per test.
    vi.mocked(catalogApi.listArchivedProducts).mockResolvedValue({
      data: [],
      error: null,
    });
    vi.mocked(hotelApi.listArchivedCages).mockResolvedValue({
      data: [
        {
          id: 'cage-1',
          cage_label: 'Makati-S-01',
          size: 'S',
          archived_at: '2026-09-28T00:00:00.000Z',
        } as never,
      ],
      error: null,
    });
    vi.mocked(maintenanceApi.listArchivedPetTypes).mockResolvedValue({
      data: [
        {
          id: 'pt-1',
          name: 'Ferret',
          archived_at: '2026-09-28T00:00:00.000Z',
        } as never,
      ],
      error: null,
    });
    vi.mocked(maintenanceApi.listArchivedBreedsAdmin).mockResolvedValue({
      data: [],
      error: null,
    });
    vi.mocked(maintenanceApi.listArchivedServices).mockResolvedValue({
      data: [
        {
          id: 'svc-1',
          name: 'Bath',
          category: 'Grooming',
          archived_at: '2026-09-28T00:00:00.000Z',
        } as never,
      ],
      error: null,
    });
    vi.mocked(maintenanceApi.listArchivedServiceTypes).mockResolvedValue({
      data: [],
      error: null,
    });
  });

  it('has a tab for every archivable config entity, including the five new ones', async () => {
    renderPage();

    for (const name of [
      'Cages',
      'Pet Types',
      'Breeds',
      'Services',
      'Service Types',
    ]) {
      expect(await screen.findByRole('tab', { name })).toBeInTheDocument();
    }
  });

  it('the Cages tab lists archived cages and restores one', async () => {
    vi.mocked(hotelApi.restoreCage).mockResolvedValue({
      data: {} as never,
      error: null,
    });

    renderPage('cages');
    const user = userEvent.setup();

    expect(await screen.findByText(/Makati-S-01 \(S\)/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /restore/i }));

    await waitFor(() =>
      expect(hotelApi.restoreCage).toHaveBeenCalledWith('cage-1', 'token')
    );
  });

  it('the Pet Types tab lists archived pet types', async () => {
    renderPage('pet-types');

    expect(await screen.findByText('Ferret')).toBeInTheDocument();
    expect(maintenanceApi.listArchivedPetTypes).toHaveBeenCalledWith('token');
  });

  it('the Services tab lists archived services with their category', async () => {
    renderPage('services');

    expect(await screen.findByText('Bath (Grooming)')).toBeInTheDocument();
  });

  it("switching tabs loads that tab's archive", async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('tab', { name: 'Breeds' }));

    await waitFor(() =>
      expect(maintenanceApi.listArchivedBreedsAdmin).toHaveBeenCalledWith(
        'token'
      )
    );
  });
});
