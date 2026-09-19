import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../../staff/api/staff.api';
import * as vetApi from '../../api/veterinary.api';
import type {
  VetMedicationCatalogItem,
  VetProcedureCatalogItem,
} from '../../veterinary.types';
import { VetCatalogPage } from './VetCatalogPage';

vi.mock('../../../staff/api/staff.api', () => ({
  getStaffProfile: vi.fn(),
}));

vi.mock('../../api/veterinary.api', () => ({
  listMedicationCatalog: vi.fn(),
  listProcedureCatalog: vi.fn(),
  createMedicationCatalogItem: vi.fn(),
  updateMedicationCatalogItem: vi.fn(),
  deleteMedicationCatalogItem: vi.fn(),
  createProcedureCatalogItem: vi.fn(),
  updateProcedureCatalogItem: vi.fn(),
  deleteProcedureCatalogItem: vi.fn(),
}));

function buildMedication(
  overrides: Partial<VetMedicationCatalogItem> = {}
): VetMedicationCatalogItem {
  return {
    id: 'med-1',
    veterinarian_id: 'vet-1',
    name: 'Amoxicillin',
    default_dose: '250mg',
    default_price: 150,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

function buildProcedure(
  overrides: Partial<VetProcedureCatalogItem> = {}
): VetProcedureCatalogItem {
  return {
    id: 'proc-1',
    veterinarian_id: 'vet-1',
    procedure_type: 'Lab test',
    description: 'CBC panel',
    default_price: 500,
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
        createElement(VetCatalogPage)
      )
    )
  );
}

function stubDefaults(
  medications: VetMedicationCatalogItem[] = [],
  procedures: VetProcedureCatalogItem[] = []
) {
  vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
    data: { id: 'vet-1', role: 'Veterinarian' } as never,
    error: null,
  });
  vi.mocked(vetApi.listMedicationCatalog).mockResolvedValue({
    data: medications,
    error: null,
  });
  vi.mocked(vetApi.listProcedureCatalog).mockResolvedValue({
    data: procedures,
    error: null,
  });
}

describe('VetCatalogPage', () => {
  it('redirects a non-Veterinarian role away from the page', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: { id: 'vet-1', role: 'Groomer' } as never,
      error: null,
    });

    renderPage();

    await waitFor(() =>
      expect(
        screen.queryByText('My Medication & Procedure Catalog')
      ).not.toBeInTheDocument()
    );
  });

  it('lists medications on the Medications tab', async () => {
    stubDefaults([buildMedication({ name: 'Amoxicillin' })]);

    renderPage();

    expect(await screen.findByText('Amoxicillin')).toBeInTheDocument();
  });

  it('Notion-style remaster (session 110): a search box narrows medications by name or dose', async () => {
    stubDefaults([
      buildMedication({ id: 'med-1', name: 'Amoxicillin' }),
      buildMedication({ id: 'med-2', name: 'Meloxicam', default_dose: '5mg' }),
    ]);
    const user = userEvent.setup();

    renderPage();

    await screen.findByText('Amoxicillin');
    await user.type(
      screen.getByPlaceholderText('Search medications...'),
      'meloxicam'
    );

    expect(screen.queryByText('Amoxicillin')).not.toBeInTheDocument();
    expect(screen.getByText('Meloxicam')).toBeInTheDocument();
  });

  it('switching to the Procedures tab lists procedures, with a Type filter tile narrowing them', async () => {
    stubDefaults(
      [],
      [
        buildProcedure({
          id: 'proc-1',
          procedure_type: 'Lab test',
          description: 'CBC panel',
        }),
        buildProcedure({
          id: 'proc-2',
          procedure_type: 'Dental',
          description: 'Scaling',
        }),
      ]
    );
    const user = userEvent.setup();

    renderPage();

    await user.click(await screen.findByRole('tab', { name: 'Procedures' }));

    expect(await screen.findByText('CBC panel')).toBeInTheDocument();
    expect(screen.getByText('Scaling')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Filter' }));
    await user.click(screen.getByRole('menuitem', { name: 'Type' }));

    // Type defaults to the first procedure type (Lab test) once added.
    expect(screen.getByText('CBC panel')).toBeInTheDocument();
    expect(screen.queryByText('Scaling')).not.toBeInTheDocument();
  });

  it('adding a medication calls the create API and shows it in the list', async () => {
    stubDefaults([]);
    vi.mocked(vetApi.createMedicationCatalogItem).mockResolvedValue({
      data: buildMedication({ id: 'med-new', name: 'Cefovecin' }),
      error: null,
    });
    const user = userEvent.setup();

    renderPage();

    await user.click(
      await screen.findByRole('button', { name: 'Add medication' })
    );
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Name'), 'Cefovecin');
    await user.click(
      within(dialog).getByRole('button', { name: 'Save medication' })
    );

    await waitFor(() =>
      expect(vetApi.createMedicationCatalogItem).toHaveBeenCalledWith(
        'token',
        expect.objectContaining({ name: 'Cefovecin' })
      )
    );
    expect(await screen.findByText('Cefovecin')).toBeInTheDocument();
  });

  it('deleting a procedure calls the delete API and removes it from the list', async () => {
    stubDefaults(
      [],
      [buildProcedure({ id: 'proc-1', description: 'CBC panel' })]
    );
    vi.mocked(vetApi.deleteProcedureCatalogItem).mockResolvedValue({
      data: null,
      error: null,
    });
    const user = userEvent.setup();

    renderPage();

    await user.click(await screen.findByRole('tab', { name: 'Procedures' }));
    await screen.findByText('CBC panel');

    await user.click(
      screen.getByRole('button', { name: 'Actions for CBC panel' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));

    await waitFor(() =>
      expect(vetApi.deleteProcedureCatalogItem).toHaveBeenCalledWith(
        'proc-1',
        'token'
      )
    );
    expect(screen.queryByText('CBC panel')).not.toBeInTheDocument();
  });
});
