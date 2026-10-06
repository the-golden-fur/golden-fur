import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../../staff/api/staff.api';
import * as customerApi from '../../../customers/api/customer.api';
import * as veterinaryApi from '../../api/veterinary.api';
import type { StaffProfile } from '../../../staff/staff.types';
import type { BookingStatus } from '../../../booking/booking.types';
import type { Consultation } from '../../veterinary.types';
import { VeterinaryConsolePage } from './VeterinaryConsolePage';

vi.mock('../../../staff/api/staff.api', () => ({
  getStaffProfile: vi.fn(),
}));
vi.mock('../../../customers/api/customer.api', () => ({
  getPet: vi.fn(),
  getCustomerProfile: vi.fn(),
  getPetHealthConditions: vi.fn(),
}));
vi.mock('../../api/veterinary.api', () => ({
  listConsultationQueue: vi.fn(),
  updateConsultation: vi.fn(),
  getPetConsultationHistory: vi.fn(),
  upsertPetHealthConditions: vi.fn(),
  listMedicationCatalog: vi.fn().mockResolvedValue({ data: [], error: null }),
  listPrescriptionTemplates: vi
    .fn()
    .mockResolvedValue({ data: [], error: null }),
  listConsultationFormTemplates: vi
    .fn()
    .mockResolvedValue({ data: [], error: null }),
}));

function buildViewerProfile(role: StaffProfile['role']): StaffProfile {
  return {
    id: 'vet-1',
    branch_id: 'branch-makati',
    role,
    username: 'vet1',
    registered_email: 'vet1@example.com',
    display_name: 'Vet One',
    profile_photo_url: null,
    phone_number: null,
    emergency_contact_name: null,
    emergency_contact_number: null,
    preferred_communication_channel: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

// Booking-status revision: the consultation's execution state now lives on
// the joined booking's status, not a consultation-local field - overriding
// `bookingStatus` (rather than `status`) is how these tests move a built
// consultation between Pending/In Progress/Completed.
function buildConsultation(
  overrides: Partial<Consultation> = {},
  bookingStatus: BookingStatus = 'Pending'
): Consultation {
  return {
    id: 'consultation-1',
    booking_id: 'booking-1',
    pet_id: 'pet-1',
    veterinarian_id: 'vet-1',
    accepted_by: null,
    temperature: null,
    weight: null,
    heart_rate: null,
    respiratory_rate: null,
    diagnosis: null,
    medications: null,
    form_responses: null,
    reason_for_visit: 'Annual checkup',
    follow_up_date: null,
    follow_up_booking_id: null,
    created_at: '2026-07-19T00:00:00.000Z',
    updated_at: '2026-07-19T00:00:00.000Z',
    booking: {
      id: 'booking-1',
      customer_id: 'customer-1',
      pet_id: 'pet-1',
      branch_id: 'branch-makati',
      created_by_staff_id: null,
      service_category: 'Veterinary',
      service_id: 'service-1',
      package_id: null,
      scheduled_start: '2026-07-19T02:00:00.000Z',
      scheduled_end: '2026-07-19T03:00:00.000Z',
      assigned_staff_id: 'vet-1',
      status: bookingStatus,
      total_price: 800,
      downpayment_amount: null,
      payment_method: null,
      payment_confirmed: true,
      special_instructions: null,
      hotel_preferences: null,
      started_at: null,
      completed_at: null,
      paid_at: null,
      cancelled_at: null,
      cancellation_reason: null,
      reschedule_count: 0,
      created_at: '2026-07-18T00:00:00.000Z',
      updated_at: '2026-07-18T00:00:00.000Z',
    },
    ...overrides,
  };
}

function stubPetAndOwner() {
  vi.mocked(customerApi.getPet).mockResolvedValue({
    data: {
      id: 'pet-1',
      customer_id: 'customer-1',
      name: 'Whiskers',
      pet_type: 'Cat',
      breed_id: null,
      photo_url: null,
      gender: 'Female',
      date_of_birth: null,
      weight_class: 'S',
      coat_type: 'SC',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
    error: null,
  });
  vi.mocked(customerApi.getCustomerProfile).mockResolvedValue({
    data: {
      id: 'customer-1',
      full_name: 'Jane Doe',
      contact_number: null,
      emergency_contact_name: null,
      emergency_contact_number: null,
      preferred_communication_channel: null,
      account_email: 'jane@example.com',
      primary_auth_provider: 'email',
      facebook_id: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
    error: null,
  });
}

/** vet-bookings-queue-access: renders whatever history state New
 * Consultation navigated with, so a test can assert on it without needing
 * to mount the real (heavy) CustomerBookingFlowPage. */
function BookingBuilderStub() {
  const location = useLocation();
  return createElement(
    'div',
    null,
    `Booking builder - locked category: ${
      (location.state as { lockedServiceCategory?: string } | null)
        ?.lockedServiceCategory ?? 'none'
    }`
  );
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
      { initialEntries: ['/staff/veterinary/console'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/staff/veterinary/console',
            element: createElement(VeterinaryConsolePage),
          }),
          createElement(Route, {
            path: '/staff/settings',
            element: createElement('div', null, 'Staff profile page'),
          }),
          createElement(Route, {
            path: '/staff/bookings/new',
            element: createElement(BookingBuilderStub),
          })
        )
      )
    )
  );
}

describe('VeterinaryConsolePage (#70)', () => {
  // Issue #78: HealthConditionsField mounts inside ConsultationDetailPanel
  // whenever a consultation is selected - defaulted here so tests that
  // select one (but don't care about health conditions) don't have to know
  // about this unrelated fetch.
  beforeEach(() => {
    vi.mocked(customerApi.getPetHealthConditions).mockResolvedValue({
      data: null,
      error: null,
    });
    vi.mocked(veterinaryApi.upsertPetHealthConditions).mockResolvedValue({
      data: null,
      error: null,
    });
  });

  it('AC-1: redirects a non-Veterinarian/Admin/Supervisor/Superadmin viewer to /staff/settings', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Receptionist'),
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Staff profile page')).toBeInTheDocument();
  });

  it('AC-1: lists today’s consultations grouped by the joined booking status (Pending/In Progress)', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Veterinarian'),
      error: null,
    });
    vi.mocked(veterinaryApi.listConsultationQueue).mockResolvedValue({
      data: {
        consultations: [
          buildConsultation({ id: 'c-pending' }, 'Pending'),
          buildConsultation({ id: 'c-ongoing' }, 'In Progress'),
        ],
      },
      error: null,
    });
    stubPetAndOwner();

    renderPage();

    const pendingRows = await screen.findAllByText('Whiskers');
    expect(pendingRows).toHaveLength(2);
    expect(
      screen.getByText('Pending', { selector: 'span' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('In Progress', { selector: 'span' })
    ).toBeInTheDocument();
  });

  it('starting a Pending consultation from its queue row also requires confirming in the shared modal', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Veterinarian'),
      error: null,
    });
    vi.mocked(veterinaryApi.listConsultationQueue).mockResolvedValue({
      data: { consultations: [buildConsultation({}, 'Pending')] },
      error: null,
    });
    stubPetAndOwner();
    vi.mocked(veterinaryApi.updateConsultation).mockResolvedValue({
      data: buildConsultation({}, 'In Progress'),
      error: null,
    });

    renderPage();

    // Only the row's own quick-start button exists yet - nothing is
    // selected, so the detail panel isn't rendered at all.
    await userEvent.click(
      await screen.findByRole('button', { name: /^start consultation$/i })
    );

    const dialog = await screen.findByRole('dialog');
    expect(veterinaryApi.updateConsultation).not.toHaveBeenCalled();

    await userEvent.click(
      within(dialog).getByRole('button', { name: /start consultation/i })
    );

    await waitFor(() =>
      expect(veterinaryApi.updateConsultation).toHaveBeenCalledWith(
        'consultation-1',
        'token',
        { status: 'Ongoing' }
      )
    );
  });

  it('a consultation taken by another vet shows no Start/Complete action, only a note', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Veterinarian'),
      error: null,
    });
    vi.mocked(veterinaryApi.listConsultationQueue).mockResolvedValue({
      data: {
        consultations: [
          buildConsultation({ accepted_by: 'vet-2' }, 'In Progress'),
        ],
      },
      error: null,
    });
    stubPetAndOwner();

    renderPage();

    expect(
      await screen.findByText('Being handled by another veterinarian')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^complete$/i })
    ).not.toBeInTheDocument();
  });

  it('the vet who took a consultation still gets its Complete action', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Veterinarian'),
      error: null,
    });
    vi.mocked(veterinaryApi.listConsultationQueue).mockResolvedValue({
      data: {
        consultations: [
          buildConsultation({ accepted_by: 'vet-1' }, 'In Progress'),
        ],
      },
      error: null,
    });
    stubPetAndOwner();

    renderPage();

    expect(
      await screen.findByRole('button', { name: /^complete$/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Being handled by another veterinarian')
    ).not.toBeInTheDocument();
  });

  it('starting a Pending consultation from the detail panel requires confirming in a modal', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Veterinarian'),
      error: null,
    });
    vi.mocked(veterinaryApi.listConsultationQueue).mockResolvedValue({
      data: { consultations: [buildConsultation({}, 'Pending')] },
      error: null,
    });
    stubPetAndOwner();
    vi.mocked(veterinaryApi.updateConsultation).mockResolvedValue({
      data: buildConsultation({}, 'In Progress'),
      error: null,
    });

    renderPage();

    // A plain row click no longer opens anything - only the row's "..."
    // menu's "View Details" action does.
    await screen.findByText('Whiskers');
    await userEvent.click(
      screen.getByRole('button', { name: 'Options for Whiskers' })
    );
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'View Details' })
    );

    const detailsDialog = await screen.findByRole('dialog', {
      name: 'Consultation Details',
    });
    await userEvent.click(
      within(detailsDialog).getByRole('button', {
        name: /^start consultation$/i,
      })
    );

    // The confirm modal nests on top of the still-open Details modal.
    const confirmDialog = await screen.findByRole('dialog', {
      name: 'Start Consultation',
    });
    expect(veterinaryApi.updateConsultation).not.toHaveBeenCalled();

    await userEvent.click(
      within(confirmDialog).getByRole('button', {
        name: /start consultation/i,
      })
    );

    await waitFor(() =>
      expect(veterinaryApi.updateConsultation).toHaveBeenCalledWith(
        'consultation-1',
        'token',
        { status: 'Ongoing' }
      )
    );
  });

  it('AC-2: completing an In Progress consultation calls updateConsultation with status Completed', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Veterinarian'),
      error: null,
    });
    vi.mocked(veterinaryApi.listConsultationQueue).mockResolvedValue({
      data: {
        consultations: [buildConsultation({}, 'In Progress')],
      },
      error: null,
    });
    stubPetAndOwner();
    vi.mocked(veterinaryApi.updateConsultation).mockResolvedValue({
      data: buildConsultation({}, 'Completed'),
      error: null,
    });

    renderPage();

    await screen.findByText('Whiskers');
    await userEvent.click(
      screen.getByRole('button', { name: 'Options for Whiskers' })
    );
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'View Details' })
    );

    const dialog = await screen.findByRole('dialog', {
      name: 'Consultation Details',
    });
    await userEvent.click(
      within(dialog).getByRole('button', { name: /complete consultation/i })
    );

    await waitFor(() =>
      expect(veterinaryApi.updateConsultation).toHaveBeenCalledWith(
        'consultation-1',
        'token',
        expect.objectContaining({ status: 'Completed' })
      )
    );
  });

  it('an In Progress row has a Complete button that finishes the consultation with just the professional fee', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Veterinarian'),
      error: null,
    });
    vi.mocked(veterinaryApi.listConsultationQueue).mockResolvedValue({
      data: { consultations: [buildConsultation({}, 'In Progress')] },
      error: null,
    });
    stubPetAndOwner();
    vi.mocked(veterinaryApi.updateConsultation).mockResolvedValue({
      data: buildConsultation({}, 'Completed'),
      error: null,
    });

    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: /^complete$/i })
    );

    const dialog = await screen.findByRole('dialog', {
      name: 'Complete Consultation',
    });
    expect(veterinaryApi.updateConsultation).not.toHaveBeenCalled();

    await userEvent.type(
      within(dialog).getByLabelText(/professional fee/i),
      '500'
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: /^complete$/i })
    );

    await waitFor(() =>
      expect(veterinaryApi.updateConsultation).toHaveBeenCalledWith(
        'consultation-1',
        'token',
        { status: 'Completed', professional_fee: 500 }
      )
    );
    // Saved medications/results are left alone - not overwritten with [].
    const payload = vi.mocked(veterinaryApi.updateConsultation).mock
      .calls[0][2];
    expect(payload.medications).toBeUndefined();
    expect(payload.form_responses).toBeUndefined();

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Complete Consultation' })
      ).not.toBeInTheDocument()
    );
    expect(
      screen.getByText('Completed', { selector: 'span' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^complete$/i })
    ).not.toBeInTheDocument();
  });

  it('shows no Complete button on Pending rows or to a view-only role', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Admin'),
      error: null,
    });
    vi.mocked(veterinaryApi.listConsultationQueue).mockResolvedValue({
      data: {
        consultations: [
          buildConsultation({ id: 'c-pending' }, 'Pending'),
          buildConsultation({ id: 'c-ongoing' }, 'In Progress'),
        ],
      },
      error: null,
    });
    stubPetAndOwner();

    renderPage();

    await screen.findAllByText('Whiskers');
    expect(
      screen.queryByRole('button', { name: /^complete$/i })
    ).not.toBeInTheDocument();
  });

  it('View Details opens the same panel (Prescription + Results as sections, no separate modals) read-only once Completed', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Veterinarian'),
      error: null,
    });
    vi.mocked(veterinaryApi.listConsultationQueue).mockResolvedValue({
      data: {
        consultations: [
          buildConsultation(
            {
              medications: [
                { name: 'Amoxicillin', dose: '250mg', notes: 'Twice daily' },
              ],
              form_responses: [
                {
                  template_id: 'tmpl-1',
                  template_name: 'Dental Check',
                  filled_at: '2026-07-19T02:00:00.000Z',
                  fields: [
                    {
                      field_id: 'f1',
                      label: 'Tartar level',
                      type: 'text',
                      value: 'Mild',
                    },
                  ],
                },
              ],
            },
            'Completed'
          ),
        ],
      },
      error: null,
    });
    stubPetAndOwner();

    renderPage();

    // List view's row options are a visible "..." button, same as Table -
    // only Board (a crowded card grid) uses right-click/long-press instead.
    await screen.findByText('Whiskers');
    await userEvent.click(
      screen.getByRole('button', { name: 'Options for Whiskers' })
    );
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'View Details' })
    );

    const dialog = await screen.findByRole('dialog', {
      name: 'Consultation Details',
    });

    // Prescription section - the medication's name is a read-only label,
    // dose/type/frequency/duration/amount are the editable (here, disabled)
    // inputs.
    expect(within(dialog).getByText('Amoxicillin')).toBeInTheDocument();
    // Results section, in the same dialog - no separate "Results" modal.
    expect(within(dialog).getByText('Dental Check')).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue('Mild')).toBeInTheDocument();

    // Read-only once Completed - every input in the panel is disabled.
    for (const input of within(dialog).getAllByRole('textbox')) {
      expect(input).toBeDisabled();
    }
  });

  it('shared-toolbar-and-tap-to-hold: adding a Status filter tile narrows the queue to just that status', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Veterinarian'),
      error: null,
    });
    vi.mocked(veterinaryApi.listConsultationQueue).mockResolvedValue({
      data: {
        consultations: [
          buildConsultation({ id: 'c-pending' }, 'Pending'),
          buildConsultation({ id: 'c-ongoing' }, 'In Progress'),
        ],
      },
      error: null,
    });
    stubPetAndOwner();

    const user = userEvent.setup();
    renderPage();

    await screen.findAllByText('Whiskers');
    const queue = screen.getByRole('list');
    expect(
      within(queue).getByText('In Progress', { selector: 'span' })
    ).toBeInTheDocument();

    // Status defaults to 'Pending' (the first status) when the tile is
    // first added - same shared FilterSortBar every other admin list page
    // uses (e.g. Breeds, Pet Types), not this page's own bespoke dropdown.
    // Scoped to the queue list itself - the filter tile's own pill also
    // renders the bare word "Pending" as a <span>.
    await user.click(screen.getByRole('button', { name: 'Filter' }));
    await user.click(screen.getByRole('menuitem', { name: 'Status' }));

    expect(
      within(queue).getByText('Pending', { selector: 'span' })
    ).toBeInTheDocument();
    expect(
      within(queue).queryByText('In Progress', { selector: 'span' })
    ).not.toBeInTheDocument();
  });

  it('shared-toolbar-and-tap-to-hold: switches to Table view, where row actions are a persistent "..." button (tap stays tap)', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Veterinarian'),
      error: null,
    });
    vi.mocked(veterinaryApi.listConsultationQueue).mockResolvedValue({
      data: { consultations: [buildConsultation({}, 'Completed')] },
      error: null,
    });
    stubPetAndOwner();

    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Whiskers');
    await user.click(screen.getByRole('button', { name: 'Table' }));

    await user.click(
      await screen.findByRole('button', { name: 'Options for Whiskers' })
    );
    expect(
      screen.getByRole('menuitem', { name: 'View Details' })
    ).toBeInTheDocument();
  });

  it('shared-toolbar-and-tap-to-hold: switches to Board view, where row actions have no persistent button - right-click/long-press opens the same menu instead', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Veterinarian'),
      error: null,
    });
    vi.mocked(veterinaryApi.listConsultationQueue).mockResolvedValue({
      data: { consultations: [buildConsultation({}, 'Completed')] },
      error: null,
    });
    stubPetAndOwner();

    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Whiskers');
    await user.click(screen.getByRole('button', { name: 'Board' }));

    expect(
      screen.queryByRole('button', { name: 'Options for Whiskers' })
    ).not.toBeInTheDocument();

    fireEvent.contextMenu(screen.getByText('Whiskers'));
    expect(
      screen.getByRole('menuitem', { name: 'View Details' })
    ).toBeInTheDocument();
  });

  it('vet-bookings-queue-access: New Consultation opens the booking builder locked to Veterinary', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Veterinarian'),
      error: null,
    });
    vi.mocked(veterinaryApi.listConsultationQueue).mockResolvedValue({
      data: { consultations: [] },
      error: null,
    });

    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: 'New Consultation' })
    );

    expect(
      await screen.findByText('Booking builder - locked category: Veterinary')
    ).toBeInTheDocument();
  });
});
