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
  listPetPrescriptions: vi.fn(),
}));
vi.mock('../../api/veterinary.api', () => ({
  listConsultationQueue: vi.fn(),
  updateConsultation: vi.fn(),
  getPetConsultationHistory: vi.fn(),
  upsertPetHealthConditions: vi.fn(),
  listMedicationCatalog: vi.fn().mockResolvedValue({ data: [], error: null }),
  listServiceCatalog: vi.fn().mockResolvedValue({ data: [], error: null }),
  listPrescriptionTemplates: vi
    .fn()
    .mockResolvedValue({ data: [], error: null }),
  listConsultationFormTemplates: vi
    .fn()
    .mockResolvedValue({ data: [], error: null }),
}));

// ScheduleFollowUpModal has its own spec (slot/staff pickers, booking,
// linking) - stubbed here to one button that reports a linked follow-up, so
// this file only covers when the page offers it and what it does after.
vi.mock('../../components/ScheduleFollowUpModal/ScheduleFollowUpModal', () => ({
  ScheduleFollowUpModal: (props: {
    consultationId: string;
    petId: string;
    petName: string;
    customerId: string;
    branchId: string;
    veterinarianId: string;
    onClose: () => void;
    onLinked: (consultation: unknown) => void;
    stepLabel?: string;
    onBack?: () => void;
  }) =>
    createElement(
      'div',
      { role: 'dialog', 'aria-label': 'Schedule follow-up' },
      createElement(
        'p',
        null,
        `for ${props.petName} (${props.petId}) of ${props.customerId} at ${props.branchId} with ${props.veterinarianId}`
      ),
      createElement(
        'button',
        {
          onClick: () => {
            props.onLinked({
              ...followUpLinkedConsultation,
              id: props.consultationId,
            });
            props.onClose();
          },
        },
        'Mock confirm follow-up'
      ),
      createElement('button', { onClick: props.onClose }, 'Mock cancel'),
      props.stepLabel ? createElement('p', null, props.stepLabel) : null,
      props.onBack
        ? createElement('button', { onClick: props.onBack }, 'Mock back')
        : null
    ),
}));

/** What the stubbed form reports back - set by the test before confirming. */
let followUpLinkedConsultation: Partial<Consultation> = {};

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
    follow_up_reason: null,
    sold_at_pharmacy: false,
    medication_transaction_id: null,
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
    vi.mocked(veterinaryApi.updateConsultation).mockReset();
    vi.mocked(veterinaryApi.listMedicationCatalog).mockResolvedValue({
      data: [],
      error: null,
    });
    vi.mocked(veterinaryApi.listPrescriptionTemplates).mockResolvedValue({
      data: [],
      error: null,
    });
    vi.mocked(veterinaryApi.listConsultationFormTemplates).mockResolvedValue({
      data: [],
      error: null,
    });
    vi.mocked(veterinaryApi.listServiceCatalog).mockResolvedValue({
      data: [],
      error: null,
    });
    window.print = vi.fn();
  });

  const AMOXICILLIN_ON_THE_LIST = {
    id: 'med-1',
    veterinarian_id: 'vet-2',
    name: 'Amoxicillin',
    default_price: 150,
    default_medicine_type: 'Oral',
    icon: null,
    image_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };

  /** Opens "View Details" for the one consultation in the queue, as a
   * Veterinarian, and returns its dialog. */
  async function openDetails(consultation: Consultation) {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Veterinarian'),
      error: null,
    });
    vi.mocked(veterinaryApi.listConsultationQueue).mockResolvedValue({
      data: { consultations: [consultation] },
      error: null,
    });
    stubPetAndOwner();

    renderPage();

    await screen.findByText('Whiskers');
    await userEvent.click(
      screen.getByRole('button', { name: 'Options for Whiskers' })
    );
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'View Details' })
    );

    return screen.findByRole('dialog', { name: 'Consultation Details' });
  }

  const servicesDialog = () =>
    screen.findByRole('dialog', { name: 'Services done for Whiskers' });

  /** Presses Complete in the details form, then confirms the "Services
   * done" pop-up it opens (with nothing listed unless a test fills it in
   * first via `fill`). */
  async function completeFromDetails(
    dialog: HTMLElement,
    fill?: (popup: HTMLElement) => Promise<void>
  ) {
    await userEvent.click(
      within(dialog).getByRole('button', { name: /complete consultation/i })
    );
    const popup = await servicesDialog();
    if (fill) await fill(popup);
    await userEvent.click(
      within(popup).getByRole('button', { name: 'Complete consultation' })
    );
  }

  describe('scheduling a follow-up', () => {
    it('the vet who handled a Completed visit can schedule its follow-up from the details form, and the visit then shows when and why', async () => {
      const completed = buildConsultation(
        { accepted_by: 'vet-1' },
        'Completed'
      );
      followUpLinkedConsultation = {
        ...completed,
        follow_up_date: '2026-08-01',
        follow_up_booking_id: 'booking-2',
        follow_up_reason: 'Recheck the ear',
      };

      const dialog = await openDetails(completed);

      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Schedule follow-up' })
      );

      const form = await screen.findByRole('dialog', {
        name: 'Schedule follow-up',
      });
      // Booked for this visit's pet, owner and branch, with this vet.
      expect(
        within(form).getByText(
          'for Whiskers (pet-1) of customer-1 at branch-makati with vet-1'
        )
      ).toBeInTheDocument();

      await userEvent.click(
        within(form).getByRole('button', { name: 'Mock confirm follow-up' })
      );

      expect(
        await within(dialog).findByText(
          'Follow-up scheduled for 2026-08-01: Recheck the ear'
        )
      ).toBeInTheDocument();
      // One follow-up per visit.
      expect(
        within(dialog).queryByRole('button', { name: 'Schedule follow-up' })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('dialog', { name: 'Schedule follow-up' })
      ).not.toBeInTheDocument();
    });

    it('is also offered straight from the row menu', async () => {
      vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
        data: buildViewerProfile('Veterinarian'),
        error: null,
      });
      vi.mocked(veterinaryApi.listConsultationQueue).mockResolvedValue({
        data: {
          consultations: [
            buildConsultation({ accepted_by: 'vet-1' }, 'Completed'),
          ],
        },
        error: null,
      });
      stubPetAndOwner();

      renderPage();

      await screen.findByText('Whiskers');
      await userEvent.click(
        screen.getByRole('button', { name: 'Options for Whiskers' })
      );
      await userEvent.click(
        screen.getByRole('menuitem', { name: 'Schedule follow-up' })
      );

      expect(
        await screen.findByRole('dialog', { name: 'Schedule follow-up' })
      ).toBeInTheDocument();
    });

    it.each([
      [
        'a visit another vet handled',
        () => buildConsultation({ accepted_by: 'vet-2' }, 'Completed'),
      ],
      [
        'a visit that is not finished yet',
        () => buildConsultation({ accepted_by: 'vet-1' }, 'In Progress'),
      ],
      [
        'a visit that already has a follow-up',
        () =>
          buildConsultation(
            {
              accepted_by: 'vet-1',
              follow_up_date: '2026-08-01',
              follow_up_booking_id: 'booking-2',
              follow_up_reason: 'Recheck the ear',
            },
            'Completed'
          ),
      ],
    ])('is not offered for %s', async (_label, build) => {
      const dialog = await openDetails(build());

      expect(
        within(dialog).queryByRole('button', { name: 'Schedule follow-up' })
      ).not.toBeInTheDocument();

      await userEvent.click(
        screen.getByRole('button', { name: 'Options for Whiskers' })
      );
      expect(
        screen.queryByRole('menuitem', { name: 'Schedule follow-up' })
      ).not.toBeInTheDocument();
    });
  });

  describe('View Details: services done', () => {
    it('lists what the vet billed at a Completed visit, with the total', async () => {
      const dialog = await openDetails(
        buildConsultation(
          {
            line_items: [
              { item_type: 'procedure', description: 'Surgery', amount: 10000 },
              {
                item_type: 'procedure',
                description: 'Wound dressing',
                amount: 350,
              },
              // Not something the vet listed as done.
              {
                item_type: 'professional_fee',
                description: 'Professional Fee',
                amount: 500,
              },
            ],
          },
          'Completed'
        )
      );

      expect(within(dialog).getByText('Services done')).toBeInTheDocument();
      expect(within(dialog).getByText('Surgery')).toBeInTheDocument();
      expect(within(dialog).getByText('Wound dressing')).toBeInTheDocument();
      expect(within(dialog).queryByText('Professional Fee')).toBeNull();
      expect(within(dialog).getByText('Total').parentElement).toHaveTextContent(
        /10,350/
      );
    });

    it('says so when nothing extra was listed', async () => {
      const dialog = await openDetails(buildConsultation({}, 'Completed'));

      expect(
        within(dialog).getByText(
          'No extra services were listed for this visit.'
        )
      ).toBeInTheDocument();
    });
  });

  describe('after completing: Step 1 Prescription, then Step 2 Follow-up', () => {
    const STEP_1 = 'Step 1 of 2: Prescription for Whiskers';

    const prescriptionDialog = () =>
      screen.findByRole('dialog', { name: STEP_1 });
    const followUpDialog = () =>
      screen.findByRole('dialog', { name: 'Schedule follow-up' });

    /** Completes the one In Progress visit from its details form and returns
     * Step 1, the "Prescription" pop-up that follows. `saved` is what the
     * server hands back for every save after that. */
    async function completeAndReachPrescription(
      saved: Partial<Consultation> = {}
    ) {
      vi.mocked(veterinaryApi.updateConsultation).mockResolvedValue({
        data: buildConsultation(
          { accepted_by: 'vet-1', ...saved },
          'Completed'
        ),
        error: null,
      });

      const dialog = await openDetails(
        buildConsultation({ accepted_by: 'vet-1' }, 'In Progress')
      );
      await completeFromDetails(dialog);

      return prescriptionDialog();
    }

    const AMOXICILLIN = {
      name: 'Amoxicillin',
      dose: '50 mg',
      notes: 'Morning',
      medicine_type: null,
      strength: '250 mg',
      frequency: null,
      duration: null,
      quantity: 1,
      medication_catalog_id: null,
    };

    it('Save and continue: a typed medicine is not lost, needs a dosage, is saved on its own, then Step 2 opens', async () => {
      const popup = await completeAndReachPrescription();

      // Step 1 takes the place of the details form.
      expect(
        screen.queryByRole('dialog', { name: 'Consultation Details' })
      ).not.toBeInTheDocument();

      // Typed, but "Add medicine" never pressed - saving adds it as a row
      // instead of dropping it, and asks for its dosage.
      await userEvent.type(
        within(popup).getByRole('combobox', { name: 'Medicine name' }),
        'Amoxicillin'
      );
      await userEvent.click(
        within(popup).getByRole('button', { name: 'Save and continue' })
      );
      expect(within(popup).getByRole('alert')).toHaveTextContent(
        'Enter a dosage for Amoxicillin.'
      );
      expect(veterinaryApi.updateConsultation).toHaveBeenCalledTimes(1);

      await userEvent.type(within(popup).getByLabelText('Dosage'), '50 mg');
      await userEvent.type(
        within(popup).getByLabelText('Instructions'),
        'Morning'
      );
      await userEvent.click(
        within(popup).getByRole('button', { name: 'Save and continue' })
      );

      await waitFor(() =>
        expect(veterinaryApi.updateConsultation).toHaveBeenCalledTimes(2)
      );
      // Only the prescription - the diagnosis on the visit is left alone.
      expect(
        vi.mocked(veterinaryApi.updateConsultation).mock.calls[1][2]
      ).toEqual({
        medications: [
          expect.objectContaining({
            name: 'Amoxicillin',
            dose: '50 mg',
            notes: 'Morning',
          }),
        ],
        sold_at_pharmacy: false,
      });

      const followUp = await followUpDialog();
      expect(within(followUp).getByText('Step 2 of 2')).toBeInTheDocument();
      expect(
        screen.queryByRole('dialog', { name: STEP_1 })
      ).not.toBeInTheDocument();
    });

    it('sends every field of the prescription form', async () => {
      const popup = await completeAndReachPrescription();

      await userEvent.type(
        within(popup).getByRole('combobox', { name: 'Medicine name' }),
        'Amoxicillin{Enter}'
      );
      await userEvent.type(within(popup).getByLabelText('Strength'), '250 mg');
      await userEvent.type(within(popup).getByLabelText('Dosage'), '10 mg/kg');
      await userEvent.type(within(popup).getByLabelText('Route'), 'Oral');
      await userEvent.type(
        within(popup).getByLabelText('Frequency'),
        'Every 12 hours'
      );
      await userEvent.type(within(popup).getByLabelText('Duration'), '7 days');
      const quantity = within(popup).getByLabelText('Quantity of Amoxicillin');
      await userEvent.clear(quantity);
      await userEvent.type(quantity, '14');
      await userEvent.type(
        within(popup).getByLabelText('Quantity unit of Amoxicillin'),
        'capsules'
      );
      await userEvent.type(
        within(popup).getByLabelText('Instructions'),
        'Give with food'
      );
      const refills = within(popup).getByLabelText('Refills');
      await userEvent.clear(refills);
      await userEvent.type(refills, '2');

      await userEvent.click(
        within(popup).getByRole('button', { name: 'Save and continue' })
      );

      await waitFor(() =>
        expect(veterinaryApi.updateConsultation).toHaveBeenCalledTimes(2)
      );
      expect(
        vi.mocked(veterinaryApi.updateConsultation).mock.calls[1][2]
      ).toMatchObject({
        medications: [
          {
            name: 'Amoxicillin',
            strength: '250 mg',
            dose: '10 mg/kg',
            medicine_type: 'Oral',
            frequency: 'Every 12 hours',
            duration: '7 days',
            quantity: 14,
            quantity_unit: 'capsules',
            notes: 'Give with food',
            refills: 2,
          },
        ],
      });
    });

    it('an empty prescription is never saved - it has to be skipped', async () => {
      const popup = await completeAndReachPrescription();

      await userEvent.click(
        within(popup).getByRole('button', { name: 'Save and continue' })
      );

      expect(within(popup).getByRole('alert')).toHaveTextContent(
        'Add a medicine first, or press Skip.'
      );
      // Only the completing save itself.
      expect(veterinaryApi.updateConsultation).toHaveBeenCalledTimes(1);
    });

    it('both steps can be skipped, Step 2 can go Back to Step 1, and skipping saves nothing', async () => {
      const popup = await completeAndReachPrescription();

      await userEvent.click(
        within(popup).getByRole('button', { name: 'Skip' })
      );

      // Back from the follow-up returns to the prescription.
      await userEvent.click(
        within(await followUpDialog()).getByRole('button', {
          name: 'Mock back',
        })
      );
      const again = await prescriptionDialog();
      expect(
        screen.queryByRole('dialog', { name: 'Schedule follow-up' })
      ).not.toBeInTheDocument();

      await userEvent.click(
        within(again).getByRole('button', { name: 'Skip' })
      );
      await userEvent.click(
        within(await followUpDialog()).getByRole('button', {
          name: 'Mock cancel',
        })
      );

      expect(
        screen.queryByRole('dialog', { name: 'Schedule follow-up' })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('dialog', { name: STEP_1 })
      ).not.toBeInTheDocument();
      expect(veterinaryApi.updateConsultation).toHaveBeenCalledTimes(1);
    });

    it('coming Back to Step 1 shows the prescription that was just saved', async () => {
      const popup = await completeAndReachPrescription({
        medications: [AMOXICILLIN],
      });

      // The visit already carries the prescription (written in the details
      // form), so Step 1 opens with it filled in.
      await userEvent.click(
        within(popup).getByRole('button', { name: 'Save and continue' })
      );

      await userEvent.click(
        within(await followUpDialog()).getByRole('button', {
          name: 'Mock back',
        })
      );

      const again = await prescriptionDialog();
      expect(within(again).getByLabelText('Dosage')).toHaveValue('50 mg');
      expect(within(again).getByLabelText('Instructions')).toHaveValue(
        'Morning'
      );
    });

    it('Print prescription saves it, shows the print sheet, and stays on Step 1', async () => {
      vi.mocked(customerApi.listPetPrescriptions).mockResolvedValue({
        data: [
          {
            consultation_id: 'consultation-1',
            date: '2026-07-19T02:00:00.000Z',
            veterinarian_name: 'Vet One',
            branch_name: 'Golden Fur Makati',
            branch_address: null,
            pet_name: 'Whiskers',
            owner_name: 'Jane Doe',
            medications: [AMOXICILLIN],
          },
        ],
        error: null,
      });
      const print = vi.spyOn(window, 'print').mockImplementation(() => {});

      const popup = await completeAndReachPrescription({
        medications: [AMOXICILLIN],
      });

      // The visit already carries the prescription (written in the details
      // form), so Step 1 opens with it filled in.
      await userEvent.click(
        within(popup).getByRole('button', { name: 'Print prescription' })
      );

      await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
      // Saved first - the sheet is built from the saved prescription.
      expect(veterinaryApi.updateConsultation).toHaveBeenCalledTimes(2);
      expect(
        screen.getByRole('document', { name: 'Prescription' })
      ).toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: STEP_1 })).toBeInTheDocument();
      expect(
        screen.queryByRole('dialog', { name: 'Schedule follow-up' })
      ).not.toBeInTheDocument();

      print.mockRestore();
    });
  });

  it('the details form does not lose a medicine typed but never added when completing', async () => {
    vi.mocked(veterinaryApi.updateConsultation).mockResolvedValue({
      data: buildConsultation({}, 'Completed'),
      error: null,
    });

    const dialog = await openDetails(buildConsultation({}, 'In Progress'));
    await userEvent.type(
      within(dialog).getByRole('combobox', { name: 'Medicine name' }),
      'Amoxicillin'
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: /complete consultation/i })
    );

    // Held for its dosage - the Services done pop-up has not opened yet.
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Enter a dosage for Amoxicillin.'
    );
    expect(
      screen.queryByRole('dialog', { name: 'Services done for Whiskers' })
    ).not.toBeInTheDocument();
    expect(veterinaryApi.updateConsultation).not.toHaveBeenCalled();
  });

  describe('services done (vet-priced visits)', () => {
    const MAJOR_SURGERY = {
      id: 'svc-1',
      name: 'Major Surgery',
      default_price: 10000,
      created_by: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    };

    it('Complete in the details form opens the pop-up first, then sends the form and the services done in one save', async () => {
      vi.mocked(veterinaryApi.listServiceCatalog).mockResolvedValue({
        data: [MAJOR_SURGERY],
        error: null,
      });
      vi.mocked(veterinaryApi.updateConsultation).mockResolvedValue({
        data: buildConsultation({}, 'Completed'),
        error: null,
      });

      const dialog = await openDetails(buildConsultation({}, 'In Progress'));
      await userEvent.type(
        within(dialog).getByLabelText('Diagnosis'),
        'Torn ligament'
      );

      await userEvent.click(
        within(dialog).getByRole('button', { name: /complete consultation/i })
      );

      const popup = await servicesDialog();
      // Nothing is saved until the pop-up is confirmed.
      expect(veterinaryApi.updateConsultation).not.toHaveBeenCalled();

      // Picked from the shared list: its usual price comes with it.
      await userEvent.type(
        within(popup).getByRole('combobox', { name: 'Service 1 name' }),
        'Major Surgery'
      );
      expect(
        within(popup).getByRole('spinbutton', { name: 'Service 1 price' })
      ).toHaveValue(10000);
      // Typed in: not on the list.
      await userEvent.click(
        within(popup).getByRole('button', { name: 'Add service' })
      );
      await userEvent.type(
        within(popup).getByRole('combobox', { name: 'Service 2 name' }),
        'Wound dressing'
      );
      await userEvent.type(
        within(popup).getByRole('spinbutton', { name: 'Service 2 price' }),
        '350'
      );

      await userEvent.click(
        within(popup).getByRole('button', { name: 'Complete consultation' })
      );

      await waitFor(() =>
        expect(veterinaryApi.updateConsultation).toHaveBeenCalledTimes(1)
      );
      expect(veterinaryApi.updateConsultation).toHaveBeenCalledWith(
        'consultation-1',
        'token',
        expect.objectContaining({
          status: 'Completed',
          diagnosis: 'Torn ligament',
          services_done: [
            { name: 'Major Surgery', amount: 10000 },
            { name: 'Wound dressing', amount: 350 },
          ],
        })
      );
      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', { name: 'Services done for Whiskers' })
        ).not.toBeInTheDocument()
      );
    });

    it('cancelling the pop-up leaves the visit open and unsaved', async () => {
      const dialog = await openDetails(buildConsultation({}, 'In Progress'));

      await userEvent.click(
        within(dialog).getByRole('button', { name: /complete consultation/i })
      );
      const popup = await servicesDialog();
      await userEvent.click(
        within(popup).getByRole('button', { name: 'Cancel' })
      );

      expect(
        screen.queryByRole('dialog', { name: 'Services done for Whiskers' })
      ).not.toBeInTheDocument();
      expect(veterinaryApi.updateConsultation).not.toHaveBeenCalled();
      expect(
        within(dialog).getByRole('button', { name: /complete consultation/i })
      ).toBeEnabled();
    });

    it('keeps the pop-up open with the reason when the server refuses to complete', async () => {
      vi.mocked(veterinaryApi.updateConsultation).mockResolvedValue({
        data: null,
        error: 'Amoxicillin has no price on the medicine list',
      });

      const dialog = await openDetails(buildConsultation({}, 'In Progress'));
      await completeFromDetails(dialog);

      const popup = await servicesDialog();
      expect(await within(popup).findByRole('alert')).toHaveTextContent(
        'Amoxicillin has no price'
      );
    });
  });

  /** Types a medicine's name into the Prescription section and adds it. */
  async function addMedicine(dialog: HTMLElement, name: string) {
    // The medicine list loads when the panel opens - a real vet is never
    // faster than it, but a test is.
    await waitFor(() =>
      expect(veterinaryApi.listMedicationCatalog).toHaveBeenCalled()
    );
    await userEvent.type(
      within(dialog).getByRole('combobox', { name: 'Medicine name' }),
      name
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Add medicine' })
    );
  }

  describe('pharmacy prescriptions', () => {
    it('a typed medicine that is on the medicine list picks up its type and list entry, whatever case it was typed in', async () => {
      vi.mocked(veterinaryApi.listMedicationCatalog).mockResolvedValue({
        data: [AMOXICILLIN_ON_THE_LIST],
        error: null,
      });
      vi.mocked(veterinaryApi.updateConsultation).mockResolvedValue({
        data: buildConsultation({}, 'Completed'),
        error: null,
      });

      const dialog = await openDetails(buildConsultation({}, 'In Progress'));
      await waitFor(() =>
        expect(veterinaryApi.listMedicationCatalog).toHaveBeenCalled()
      );

      await addMedicine(dialog, 'amoxicillin');

      // The list's own spelling and type are used, and the box is cleared
      // ready for the next medicine.
      expect(within(dialog).getByText('Amoxicillin')).toBeInTheDocument();
      expect(within(dialog).getByLabelText('Route')).toHaveValue('Oral');
      expect(
        within(dialog).getByRole('combobox', { name: 'Medicine name' })
      ).toHaveValue('');

      await userEvent.type(within(dialog).getByLabelText('Dosage'), '50mg');
      await completeFromDetails(dialog);

      await waitFor(() =>
        expect(veterinaryApi.updateConsultation).toHaveBeenCalledWith(
          'consultation-1',
          'token',
          expect.objectContaining({
            medications: [
              expect.objectContaining({
                name: 'Amoxicillin',
                medication_catalog_id: 'med-1',
              }),
            ],
          })
        )
      );
    });

    it('any medicine can be typed in, even one that is not on the medicine list - it just cannot be sold here', async () => {
      vi.mocked(veterinaryApi.updateConsultation).mockResolvedValue({
        data: buildConsultation({}, 'Completed'),
        error: null,
      });

      const dialog = await openDetails(buildConsultation({}, 'In Progress'));

      // Pressing Enter adds it too.
      await userEvent.type(
        within(dialog).getByRole('combobox', { name: 'Medicine name' }),
        'Mystery syrup{Enter}'
      );
      await userEvent.type(within(dialog).getByLabelText('Dosage'), '5ml');
      await userEvent.type(
        within(dialog).getByLabelText('Instructions'),
        'After meals'
      );

      await userEvent.click(
        within(dialog).getByRole('radio', { name: 'Buying from our pharmacy' })
      );
      expect(within(dialog).getByText('No price set')).toBeInTheDocument();
      expect(within(dialog).getByRole('status')).toHaveTextContent(
        'Mystery syrup'
      );

      await userEvent.click(
        within(dialog).getByRole('radio', {
          name: 'Buying from another pharmacy',
        })
      );
      await completeFromDetails(dialog);

      await waitFor(() =>
        expect(veterinaryApi.updateConsultation).toHaveBeenCalledWith(
          'consultation-1',
          'token',
          expect.objectContaining({
            sold_at_pharmacy: false,
            medications: [
              expect.objectContaining({
                name: 'Mystery syrup',
                dose: '5ml',
                notes: 'After meals',
                medication_catalog_id: null,
              }),
            ],
          })
        )
      );
    });

    it('the Consultation Details form has no Professional Fee box and completes without one', async () => {
      vi.mocked(veterinaryApi.updateConsultation).mockResolvedValue({
        data: buildConsultation({}, 'Completed'),
        error: null,
      });

      const dialog = await openDetails(buildConsultation({}, 'In Progress'));

      expect(within(dialog).queryByText(/professional fee/i)).toBeNull();

      await completeFromDetails(dialog);

      await waitFor(() =>
        expect(veterinaryApi.updateConsultation).toHaveBeenCalled()
      );
      const payload = vi.mocked(veterinaryApi.updateConsultation).mock
        .calls[0][2];
      expect(payload.status).toBe('Completed');
      expect(payload.professional_fee).toBeUndefined();
    });

    it('opens straight onto the form - no "Choose consultation form(s)" popup, even with a default form saved', async () => {
      vi.mocked(veterinaryApi.listConsultationFormTemplates).mockResolvedValue({
        data: [
          {
            id: 'tmpl-1',
            veterinarian_id: 'vet-1',
            name: 'General Consultation',
            fields: [{ id: 'f1', label: 'Temperature', type: 'number' }],
            is_default: true,
            icon: null,
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
          },
        ],
        error: null,
      });

      const dialog = await openDetails(buildConsultation({}, 'In Progress'));
      await waitFor(() =>
        expect(veterinaryApi.listConsultationFormTemplates).toHaveBeenCalled()
      );
      // Let the loaded templates reach the panel before asserting on it.
      await within(dialog).findByText('Results');
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(
        screen.queryByRole('dialog', { name: 'Choose consultation form(s)' })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Pick which of your saved consultation forms/)
      ).not.toBeInTheDocument();
      // The only dialog open is the details panel itself.
      expect(screen.getAllByRole('dialog')).toHaveLength(1);
    });

    it('does not add a blank medicine', async () => {
      const dialog = await openDetails(buildConsultation({}, 'In Progress'));

      await userEvent.type(
        within(dialog).getByRole('combobox', { name: 'Medicine name' }),
        '   '
      );
      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Add medicine' })
      );

      expect(within(dialog).queryByLabelText('Dosage')).toBeNull();
    });

    it('no longer offers "Add from a saved prescription" in the Prescription section', async () => {
      vi.mocked(veterinaryApi.listPrescriptionTemplates).mockResolvedValue({
        data: [
          {
            id: 'rx-1',
            veterinarian_id: 'vet-1',
            name: 'Ear infection kit',
            items: [],
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
          },
        ],
        error: null,
      });

      const dialog = await openDetails(buildConsultation({}, 'In Progress'));
      await waitFor(() =>
        expect(veterinaryApi.listPrescriptionTemplates).toHaveBeenCalled()
      );

      expect(
        within(dialog).getByRole('combobox', { name: 'Medicine name' })
      ).toBeInTheDocument();
      expect(
        within(dialog).queryByRole('combobox', {
          name: 'Add from a saved prescription',
        })
      ).not.toBeInTheDocument();
    });

    it('completes with a diagnosis and a quantity, and bills no medicine unless the vet says it is bought here', async () => {
      vi.mocked(veterinaryApi.listMedicationCatalog).mockResolvedValue({
        data: [AMOXICILLIN_ON_THE_LIST],
        error: null,
      });
      vi.mocked(veterinaryApi.updateConsultation).mockResolvedValue({
        data: buildConsultation({}, 'Completed'),
        error: null,
      });

      const dialog = await openDetails(buildConsultation({}, 'In Progress'));

      await userEvent.type(
        within(dialog).getByLabelText('Diagnosis'),
        'Ear infection'
      );
      await addMedicine(dialog, 'Amoxicillin');
      const quantity = within(dialog).getByLabelText('Quantity of Amoxicillin');
      await userEvent.clear(quantity);
      await userEvent.type(quantity, '2');
      await userEvent.type(within(dialog).getByLabelText('Dosage'), '50mg');

      // A price is never typed in - it comes from the medicine list.
      expect(
        within(dialog).queryByPlaceholderText(/amount/i)
      ).not.toBeInTheDocument();
      // Buying elsewhere is the default, so nothing is billed by accident.
      expect(
        within(dialog).getByRole('radio', {
          name: 'Buying from another pharmacy',
        })
      ).toBeChecked();

      await completeFromDetails(dialog);

      await waitFor(() =>
        expect(veterinaryApi.updateConsultation).toHaveBeenCalledWith(
          'consultation-1',
          'token',
          expect.objectContaining({
            status: 'Completed',
            diagnosis: 'Ear infection',
            sold_at_pharmacy: false,
            medications: [
              expect.objectContaining({
                name: 'Amoxicillin',
                dose: '50mg',
                quantity: 2,
                medication_catalog_id: 'med-1',
              }),
            ],
          })
        )
      );
      const payload = vi.mocked(veterinaryApi.updateConsultation).mock
        .calls[0][2];
      expect(payload.medications?.[0]).not.toHaveProperty('amount');
    });

    it('choosing "Buying from our pharmacy" shows the medicine total from the list prices and sends that choice', async () => {
      vi.mocked(veterinaryApi.listMedicationCatalog).mockResolvedValue({
        data: [AMOXICILLIN_ON_THE_LIST],
        error: null,
      });
      vi.mocked(veterinaryApi.updateConsultation).mockResolvedValue({
        data: buildConsultation({}, 'Completed'),
        error: null,
      });

      const dialog = await openDetails(buildConsultation({}, 'In Progress'));

      await addMedicine(dialog, 'Amoxicillin');
      const quantity = within(dialog).getByLabelText('Quantity of Amoxicillin');
      await userEvent.clear(quantity);
      await userEvent.type(quantity, '2');
      await userEvent.type(within(dialog).getByLabelText('Dosage'), '50mg');

      expect(within(dialog).queryByText(/Medicine total/)).toBeNull();

      await userEvent.click(
        within(dialog).getByRole('radio', { name: 'Buying from our pharmacy' })
      );

      expect(
        within(dialog).getByText(/Medicine total: ₱300\.00/)
      ).toBeInTheDocument();

      await completeFromDetails(dialog);

      await waitFor(() =>
        expect(veterinaryApi.updateConsultation).toHaveBeenCalledWith(
          'consultation-1',
          'token',
          expect.objectContaining({ sold_at_pharmacy: true })
        )
      );
    });

    it('lets the vet who handled a Completed visit edit its diagnosis and prescription, saved without a status', async () => {
      const completed = buildConsultation(
        {
          accepted_by: 'vet-1',
          diagnosis: 'Ear infection',
          medications: [
            {
              name: 'Amoxicillin',
              dose: '50mg',
              quantity: 2,
              medication_catalog_id: 'med-1',
            },
          ],
        },
        'Completed'
      );
      vi.mocked(veterinaryApi.updateConsultation).mockResolvedValue({
        data: { ...completed, diagnosis: 'Otitis externa' },
        error: null,
      });

      const dialog = await openDetails(completed);

      const diagnosis = within(dialog).getByLabelText('Diagnosis');
      expect(diagnosis).toBeDisabled();

      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Edit record' })
      );
      expect(diagnosis).toBeEnabled();
      // Only the diagnosis and prescription unlock - the visit stays final.
      expect(
        within(dialog).queryByRole('button', { name: /complete consultation/i })
      ).not.toBeInTheDocument();

      await userEvent.clear(diagnosis);
      await userEvent.type(diagnosis, 'Otitis externa');
      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Save changes' })
      );

      await waitFor(() =>
        expect(veterinaryApi.updateConsultation).toHaveBeenCalledWith(
          'consultation-1',
          'token',
          {
            diagnosis: 'Otitis externa',
            sold_at_pharmacy: false,
            medications: [
              expect.objectContaining({
                name: 'Amoxicillin',
                quantity: 2,
                medication_catalog_id: 'med-1',
              }),
            ],
          }
        )
      );
      // Saved - back to read-only.
      await waitFor(() => expect(diagnosis).toBeDisabled());
    });

    it('Cancel discards an unsaved edit', async () => {
      const dialog = await openDetails(
        buildConsultation(
          { accepted_by: 'vet-1', diagnosis: 'Ear infection' },
          'Completed'
        )
      );

      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Edit record' })
      );
      const diagnosis = within(dialog).getByLabelText('Diagnosis');
      await userEvent.clear(diagnosis);
      await userEvent.type(diagnosis, 'Wrong');
      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Cancel' })
      );

      expect(diagnosis).toHaveValue('Ear infection');
      expect(diagnosis).toBeDisabled();
      expect(veterinaryApi.updateConsultation).not.toHaveBeenCalled();
    });

    it('offers no Edit record on a Completed visit another vet handled', async () => {
      const dialog = await openDetails(
        buildConsultation({ accepted_by: 'vet-2' }, 'Completed')
      );

      expect(
        within(dialog).queryByRole('button', { name: 'Edit record' })
      ).not.toBeInTheDocument();
    });

    it('says the bill will not change once the medicine has been paid, and locks where it was bought', async () => {
      const dialog = await openDetails(
        buildConsultation(
          {
            accepted_by: 'vet-1',
            sold_at_pharmacy: true,
            medication_transaction_id: 'txn-1',
            medication_transaction: { payment_status: 'Fully Paid' },
            medications: [
              {
                name: 'Amoxicillin',
                dose: '50mg',
                quantity: 2,
                medication_catalog_id: 'med-1',
              },
            ],
          },
          'Completed'
        )
      );

      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Edit record' })
      );

      expect(within(dialog).getByText(/already been paid/)).toBeInTheDocument();
      expect(
        within(dialog).getByRole('radio', { name: 'Buying from our pharmacy' })
      ).toBeDisabled();
      expect(within(dialog).getByLabelText('Dosage')).toBeEnabled();
    });

    it('prints a Completed visit prescription with the vet and branch on it', async () => {
      vi.mocked(customerApi.listPetPrescriptions).mockResolvedValue({
        data: [
          {
            consultation_id: 'consultation-1',
            date: '2026-07-19T03:00:00.000Z',
            veterinarian_name: 'Dr. Reyes',
            branch_name: 'Golden Fur Makati',
            branch_address: '123 Ayala Ave, Makati',
            pet_name: 'Whiskers',
            owner_name: 'Jane Doe',
            medications: [{ name: 'Amoxicillin', dose: '50mg', quantity: 2 }],
          },
        ],
        error: null,
      });

      const dialog = await openDetails(
        buildConsultation(
          {
            medications: [{ name: 'Amoxicillin', dose: '50mg', quantity: 2 }],
          },
          'Completed'
        )
      );

      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Print prescription' })
      );

      const sheet = await screen.findByRole('document', {
        name: 'Prescription',
      });
      expect(within(sheet).getByText('Golden Fur Makati')).toBeInTheDocument();
      expect(within(sheet).getAllByText('Dr. Reyes').length).toBeGreaterThan(0);
      expect(customerApi.listPetPrescriptions).toHaveBeenCalledWith(
        'pet-1',
        'token'
      );
      await waitFor(() => expect(window.print).toHaveBeenCalledTimes(1));
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
    await completeFromDetails(dialog);

    await waitFor(() =>
      expect(veterinaryApi.updateConsultation).toHaveBeenCalledWith(
        'consultation-1',
        'token',
        expect.objectContaining({ status: 'Completed' })
      )
    );
  });

  it('an In Progress row has a Complete button that opens the same Services done pop-up and finishes the visit from there', async () => {
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

    const popup = await screen.findByRole('dialog', {
      name: 'Services done for Whiskers',
    });
    expect(veterinaryApi.updateConsultation).not.toHaveBeenCalled();
    // The old Professional Fee box is gone - prices go on the services.
    expect(within(popup).queryByText(/professional fee/i)).toBeNull();

    await userEvent.type(
      within(popup).getByRole('combobox', { name: 'Service 1 name' }),
      'Surgery'
    );
    await userEvent.type(
      within(popup).getByRole('spinbutton', { name: 'Service 1 price' }),
      '10000'
    );
    await userEvent.click(
      within(popup).getByRole('button', { name: 'Complete consultation' })
    );

    await waitFor(() =>
      expect(veterinaryApi.updateConsultation).toHaveBeenCalledWith(
        'consultation-1',
        'token',
        {
          status: 'Completed',
          services_done: [{ name: 'Surgery', amount: 10000 }],
        }
      )
    );
    // Saved medications/results are left alone - not overwritten with [].
    const payload = vi.mocked(veterinaryApi.updateConsultation).mock
      .calls[0][2];
    expect(payload.medications).toBeUndefined();
    expect(payload.form_responses).toBeUndefined();

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Services done for Whiskers' })
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
