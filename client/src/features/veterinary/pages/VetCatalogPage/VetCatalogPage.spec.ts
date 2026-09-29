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
import * as staffApi from '../../../staff/api/staff.api';
import * as vetApi from '../../api/veterinary.api';
import type {
  ConsultationFormTemplate,
  VetMedicationCatalogItem,
  VetPrescriptionTemplate,
} from '../../veterinary.types';
import { VetCatalogPage } from './VetCatalogPage';

vi.mock('../../../staff/api/staff.api', () => ({
  getStaffProfile: vi.fn(),
}));

vi.mock('../../api/veterinary.api', () => ({
  listMedicationCatalog: vi.fn(),
  listPrescriptionTemplates: vi.fn(),
  listConsultationFormTemplates: vi.fn(),
  createMedicationCatalogItem: vi.fn(),
  updateMedicationCatalogItem: vi.fn(),
  deleteMedicationCatalogItem: vi.fn(),
  createPrescriptionTemplate: vi.fn(),
  updatePrescriptionTemplate: vi.fn(),
  deletePrescriptionTemplate: vi.fn(),
  createConsultationFormTemplate: vi.fn(),
  updateConsultationFormTemplate: vi.fn(),
  deleteConsultationFormTemplate: vi.fn(),
}));

function buildMedication(
  overrides: Partial<VetMedicationCatalogItem> = {}
): VetMedicationCatalogItem {
  return {
    id: 'med-1',
    veterinarian_id: 'vet-1',
    name: 'Amoxicillin',
    default_price: 150,
    default_medicine_type: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

function buildPrescriptionTemplate(
  overrides: Partial<VetPrescriptionTemplate> = {}
): VetPrescriptionTemplate {
  return {
    id: 'rx-1',
    veterinarian_id: 'vet-1',
    name: 'Standard Post-Surgery Recovery',
    items: [
      {
        medication_catalog_id: 'med-1',
        name: 'Amoxicillin',
        medicine_type: 'Oral',
        dose: '1 tablet',
        frequency: 'Twice daily',
      },
    ],
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

function buildTemplate(
  overrides: Partial<ConsultationFormTemplate> = {}
): ConsultationFormTemplate {
  return {
    id: 'tmpl-1',
    veterinarian_id: 'vet-1',
    name: 'Dental Check',
    fields: [{ id: 'f1', label: 'Tartar level', type: 'text' }],
    is_default: false,
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
  prescriptionTemplates: VetPrescriptionTemplate[] = [],
  templates: ConsultationFormTemplate[] = []
) {
  vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
    data: { id: 'vet-1', role: 'Veterinarian' } as never,
    error: null,
  });
  vi.mocked(vetApi.listMedicationCatalog).mockResolvedValue({
    data: medications,
    error: null,
  });
  vi.mocked(vetApi.listPrescriptionTemplates).mockResolvedValue({
    data: prescriptionTemplates,
    error: null,
  });
  vi.mocked(vetApi.listConsultationFormTemplates).mockResolvedValue({
    data: templates,
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
      expect(screen.queryByText('My Catalog')).not.toBeInTheDocument()
    );
  });

  it('lists medications on the Medications tab', async () => {
    stubDefaults([buildMedication({ name: 'Amoxicillin' })]);

    renderPage();

    expect(await screen.findByText('Amoxicillin')).toBeInTheDocument();
  });

  it('a search box narrows medications by name', async () => {
    stubDefaults([
      buildMedication({ id: 'med-1', name: 'Amoxicillin' }),
      buildMedication({ id: 'med-2', name: 'Meloxicam' }),
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

  it("switching to the Prescriptions tab lists a vet's own prescription templates", async () => {
    stubDefaults([], [buildPrescriptionTemplate({ name: 'Recovery Plan' })]);
    const user = userEvent.setup();

    renderPage();

    await user.click(await screen.findByRole('tab', { name: 'Prescriptions' }));

    expect(await screen.findByText('Recovery Plan')).toBeInTheDocument();
  });

  it("switching to the Forms tab lists a vet's own templates", async () => {
    stubDefaults(
      [],
      [],
      [
        buildTemplate({ id: 'tmpl-1', name: 'Dental Check' }),
        buildTemplate({ id: 'tmpl-2', name: 'Wellness Exam' }),
      ]
    );
    const user = userEvent.setup();

    renderPage();

    await user.click(await screen.findByRole('tab', { name: 'Forms' }));

    expect(await screen.findByText('Dental Check')).toBeInTheDocument();
    expect(screen.getByText('Wellness Exam')).toBeInTheDocument();
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

  it('adding a prescription pulling one medication calls the create API', async () => {
    stubDefaults([buildMedication({ id: 'med-1', name: 'Amoxicillin' })]);
    vi.mocked(vetApi.createPrescriptionTemplate).mockResolvedValue({
      data: buildPrescriptionTemplate({ id: 'rx-new', name: 'New Recovery' }),
      error: null,
    });
    const user = userEvent.setup();

    renderPage();

    await user.click(await screen.findByRole('tab', { name: 'Prescriptions' }));
    await user.click(
      await screen.findByRole('button', { name: 'Add prescription' })
    );
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Name'), 'New Recovery');
    await user.click(
      within(dialog).getByRole('button', { name: 'Add medication' })
    );
    await user.selectOptions(
      within(dialog).getByDisplayValue('Choose a medication...'),
      'med-1'
    );
    const doseInput = within(dialog).getByPlaceholderText('Dose');
    await user.type(doseInput, '1 tablet');
    const frequencyInput = within(dialog).getByPlaceholderText('Frequency');
    await user.type(frequencyInput, 'Twice daily');
    await user.click(
      within(dialog).getByRole('button', { name: 'Save prescription' })
    );

    await waitFor(() =>
      expect(vetApi.createPrescriptionTemplate).toHaveBeenCalledWith(
        'token',
        expect.objectContaining({
          name: 'New Recovery',
          items: [
            expect.objectContaining({
              medication_catalog_id: 'med-1',
              name: 'Amoxicillin',
              dose: '1 tablet',
              frequency: 'Twice daily',
            }),
          ],
        })
      )
    );
    expect(await screen.findByText('New Recovery')).toBeInTheDocument();
  });

  it('adding a form template with one field calls the create API and shows it in the list', async () => {
    stubDefaults([], [], []);
    vi.mocked(vetApi.createConsultationFormTemplate).mockResolvedValue({
      data: buildTemplate({ id: 'tmpl-new', name: 'Behavior Notes' }),
      error: null,
    });
    const user = userEvent.setup();

    renderPage();

    await user.click(await screen.findByRole('tab', { name: 'Forms' }));
    await user.click(
      await screen.findByRole('button', { name: 'Add form template' })
    );
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Name'), 'Behavior Notes');
    await user.click(within(dialog).getByRole('button', { name: 'Add field' }));
    await user.type(within(dialog).getByPlaceholderText('Field label'), 'Mood');
    await user.click(
      within(dialog).getByRole('button', { name: 'Save form template' })
    );

    await waitFor(() =>
      expect(vetApi.createConsultationFormTemplate).toHaveBeenCalledWith(
        'token',
        expect.objectContaining({
          name: 'Behavior Notes',
          fields: [expect.objectContaining({ label: 'Mood', type: 'text' })],
        })
      )
    );
    expect(await screen.findByText('Behavior Notes')).toBeInTheDocument();
  });

  it('deleting a form template calls the delete API and removes it from the list', async () => {
    stubDefaults(
      [],
      [],
      [buildTemplate({ id: 'tmpl-1', name: 'Dental Check' })]
    );
    vi.mocked(vetApi.deleteConsultationFormTemplate).mockResolvedValue({
      data: null,
      error: null,
    });
    const user = userEvent.setup();

    renderPage();

    await user.click(await screen.findByRole('tab', { name: 'Forms' }));
    await screen.findByText('Dental Check');

    // Forms tab now defaults to List view (a visible "..." button) - only
    // Board uses right-click/hold, same convention as Medications.
    await user.click(
      screen.getByRole('button', { name: 'Actions for Dental Check' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));

    await waitFor(() =>
      expect(vetApi.deleteConsultationFormTemplate).toHaveBeenCalledWith(
        'tmpl-1',
        'token'
      )
    );
    expect(screen.queryByText('Dental Check')).not.toBeInTheDocument();
  });

  it('Table/List/Board views are available on the Medications tab', async () => {
    stubDefaults([buildMedication({ name: 'Amoxicillin' })]);

    renderPage();

    await screen.findByText('Amoxicillin');

    expect(
      screen.getByRole('group', { name: 'Medications view' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Table' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Board' })).toBeInTheDocument();
  });

  it('List view: a visible "..." button opens the same menu Board reaches by hold/right-click', async () => {
    stubDefaults([buildMedication({ name: 'Amoxicillin' })]);
    const user = userEvent.setup();

    renderPage();

    await screen.findByText('Amoxicillin');

    const menuButton = screen.getByRole('button', {
      name: 'Actions for Amoxicillin',
    });
    await user.click(menuButton);
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument();
  });

  it('Board view: no persistent "..." button - right-click/long-press opens the same menu instead', async () => {
    stubDefaults([buildMedication({ name: 'Amoxicillin' })]);
    const user = userEvent.setup();

    renderPage();

    await screen.findByText('Amoxicillin');
    await user.click(screen.getByRole('button', { name: 'Board' }));

    expect(
      screen.queryByRole('button', { name: 'Actions for Amoxicillin' })
    ).not.toBeInTheDocument();

    fireEvent.contextMenu(screen.getByText('Amoxicillin'));
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument();
  });
});
