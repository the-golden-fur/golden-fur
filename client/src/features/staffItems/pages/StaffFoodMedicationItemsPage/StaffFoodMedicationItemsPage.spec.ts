import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../../staff/api/staff.api';
import * as staffItemsApi from '../../api/staffItems.api';
import type {
  StaffFoodItem,
  StaffMedicationItem,
} from '../../staffItems.types';
import { StaffFoodMedicationItemsPage } from './StaffFoodMedicationItemsPage';

vi.mock('../../../staff/api/staff.api', () => ({
  getStaffProfile: vi.fn(),
}));

vi.mock('../../api/staffItems.api', () => ({
  listMyFoodItems: vi.fn(),
  listMyMedicationItems: vi.fn(),
  listPickableFoodItems: vi.fn(),
  listPickableMedicationItems: vi.fn(),
  createFoodItem: vi.fn(),
  createMedicationItem: vi.fn(),
  updateFoodItem: vi.fn(),
  updateMedicationItem: vi.fn(),
  archiveFoodItem: vi.fn(),
  archiveMedicationItem: vi.fn(),
}));

function buildFoodItem(overrides: Partial<StaffFoodItem> = {}): StaffFoodItem {
  return {
    id: 'food-1',
    owner_staff_id: 'staff-1',
    name: 'Chicken kibble',
    quantity: '1',
    quantity_unit: 'cup',
    special_instructions: null,
    photo_url: null,
    is_public: false,
    archived_at: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

function buildMedicationItem(
  overrides: Partial<StaffMedicationItem> = {}
): StaffMedicationItem {
  return {
    id: 'med-1',
    owner_staff_id: 'staff-1',
    name: 'Amoxicillin',
    dose: '1 tablet',
    dose_unit: 'tablet',
    administration_notes: null,
    photo_url: null,
    is_public: false,
    archived_at: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

function renderPage() {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'staff-1', email: 'staff1@example.com' },
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
        createElement(StaffFoodMedicationItemsPage)
      )
    )
  );
}

function stubRole(role: string) {
  vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
    data: { id: 'staff-1', role } as never,
    error: null,
  });
}

describe('StaffFoodMedicationItemsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects a role outside STAFF_ITEM_ROLES away from the page', async () => {
    stubRole('Cashier');

    renderPage();

    await waitFor(() =>
      expect(
        screen.queryByText('Food & Medication Items')
      ).not.toBeInTheDocument()
    );
  });

  it('lists food and medication items in one combined table for a non-admin role', async () => {
    stubRole('Receptionist');
    vi.mocked(staffItemsApi.listMyFoodItems).mockResolvedValue({
      data: [buildFoodItem({ name: 'Chicken kibble' })],
      error: null,
    });
    vi.mocked(staffItemsApi.listMyMedicationItems).mockResolvedValue({
      data: [buildMedicationItem({ name: 'Amoxicillin' })],
      error: null,
    });

    renderPage();

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Chicken kibble')).toBeInTheDocument();
    expect(screen.getByText('Amoxicillin')).toBeInTheDocument();
    expect(staffItemsApi.listPickableFoodItems).not.toHaveBeenCalled();
  });

  it('fetches the pickable (own + public) lists for an Admin viewer', async () => {
    stubRole('Admin');
    vi.mocked(staffItemsApi.listPickableFoodItems).mockResolvedValue({
      data: [],
      error: null,
    });
    vi.mocked(staffItemsApi.listPickableMedicationItems).mockResolvedValue({
      data: [],
      error: null,
    });

    renderPage();

    await waitFor(() =>
      expect(staffItemsApi.listPickableFoodItems).toHaveBeenCalled()
    );
    expect(staffItemsApi.listMyFoodItems).not.toHaveBeenCalled();
  });

  it('two-step add flow: chooser modal then the matching create form', async () => {
    stubRole('Receptionist');
    vi.mocked(staffItemsApi.listMyFoodItems).mockResolvedValue({
      data: [],
      error: null,
    });
    vi.mocked(staffItemsApi.listMyMedicationItems).mockResolvedValue({
      data: [],
      error: null,
    });
    vi.mocked(staffItemsApi.createMedicationItem).mockResolvedValue({
      data: buildMedicationItem({ name: 'Metacam' }),
      error: null,
    });

    renderPage();
    await screen.findByText('No items match this filter.');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /add item/i }));
    expect(screen.getByText('What are you adding?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Medication' }));
    expect(screen.getByText('Add medication item')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Name'), 'Metacam');
    await user.type(screen.getByLabelText('Dose'), '1 ml');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(staffItemsApi.createMedicationItem).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Metacam', dose: '1 ml' }),
        'token'
      )
    );
  });

  it('toggling public calls updateFoodItem with is_public', async () => {
    stubRole('Receptionist');
    const item = buildFoodItem({ name: 'Chicken kibble', is_public: false });
    vi.mocked(staffItemsApi.listMyFoodItems).mockResolvedValue({
      data: [item],
      error: null,
    });
    vi.mocked(staffItemsApi.listMyMedicationItems).mockResolvedValue({
      data: [],
      error: null,
    });
    vi.mocked(staffItemsApi.updateFoodItem).mockResolvedValue({
      data: { ...item, is_public: true },
      error: null,
    });

    renderPage();
    await screen.findByRole('table');

    const user = userEvent.setup();
    await user.click(screen.getByRole('switch'));

    await waitFor(() =>
      expect(staffItemsApi.updateFoodItem).toHaveBeenCalledWith(
        'food-1',
        { is_public: true },
        'token'
      )
    );
  });

  it('archiving an item via the "..." menu removes it from the list', async () => {
    stubRole('Receptionist');
    vi.mocked(staffItemsApi.listMyFoodItems).mockResolvedValue({
      data: [buildFoodItem({ name: 'Chicken kibble' })],
      error: null,
    });
    vi.mocked(staffItemsApi.listMyMedicationItems).mockResolvedValue({
      data: [],
      error: null,
    });
    vi.mocked(staffItemsApi.archiveFoodItem).mockResolvedValue({
      data: null,
      error: null,
    });

    renderPage();
    await screen.findByText('Chicken kibble');

    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: 'Actions for Chicken kibble' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Archive' }));

    await waitFor(() =>
      expect(screen.queryByText('Chicken kibble')).not.toBeInTheDocument()
    );
  });
});
