import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
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
  scheduleFollowUp: vi.fn(),
  getPetConsultationHistory: vi.fn(),
  upsertPetHealthConditions: vi.fn(),
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
    temperature: null,
    weight: null,
    heart_rate: null,
    respiratory_rate: null,
    diagnosis: null,
    medications: null,
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
            path: '/staff/profile',
            element: createElement('div', null, 'Staff profile page'),
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

  it('AC-1: redirects a non-Veterinarian/Admin/Supervisor/Superadmin viewer to /staff/profile', async () => {
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

    await userEvent.click(await screen.findByText('Whiskers'));
    await userEvent.click(
      await screen.findByRole('button', { name: /complete consultation/i })
    );

    await waitFor(() =>
      expect(veterinaryApi.updateConsultation).toHaveBeenCalledWith(
        'consultation-1',
        'token',
        expect.objectContaining({ status: 'Completed' })
      )
    );
  });

  it('AC-3: the Pet History tab loads and shows prior consultations', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Veterinarian'),
      error: null,
    });
    vi.mocked(veterinaryApi.listConsultationQueue).mockResolvedValue({
      data: { consultations: [buildConsultation()] },
      error: null,
    });
    stubPetAndOwner();
    vi.mocked(veterinaryApi.getPetConsultationHistory).mockResolvedValue({
      data: [
        buildConsultation(
          { id: 'prior-1', diagnosis: 'Old diagnosis' },
          'Completed'
        ),
      ],
      error: null,
    });

    renderPage();

    await userEvent.click(await screen.findByText('Whiskers'));
    await userEvent.click(screen.getByRole('tab', { name: /pet history/i }));

    expect(await screen.findByText(/Old diagnosis/)).toBeInTheDocument();
  });

  it('AC-4: scheduling a follow-up shows the "Follow-up scheduled" indicator', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Veterinarian'),
      error: null,
    });
    vi.mocked(veterinaryApi.listConsultationQueue).mockResolvedValue({
      data: {
        // The queue endpoint only ever returns Pending/In Progress bookings
        // (STATUS_GROUPS), so the follow-up form - only reachable once the
        // booking is finished (FINISHED_BOOKING_STATUSES) - has to be reached
        // by actually completing the consultation below, not by seeding an
        // already-Completed row here.
        consultations: [buildConsultation({}, 'In Progress')],
      },
      error: null,
    });
    stubPetAndOwner();
    vi.mocked(veterinaryApi.updateConsultation).mockResolvedValue({
      data: buildConsultation({}, 'Completed'),
      error: null,
    });
    vi.mocked(veterinaryApi.scheduleFollowUp).mockResolvedValue({
      data: {
        consultation: buildConsultation(
          {
            follow_up_date: '2026-08-01',
            follow_up_booking_id: 'booking-2',
          },
          'Completed'
        ),
        booking: {
          id: 'booking-2',
          customer_id: 'customer-1',
          pet_id: 'pet-1',
          branch_id: 'branch-makati',
          created_by_staff_id: 'vet-1',
          service_category: 'Veterinary',
          service_id: 'service-1',
          package_id: null,
          scheduled_start: '2026-08-01T09:00:00.000Z',
          scheduled_end: '2026-08-01T10:00:00.000Z',
          assigned_staff_id: null,
          status: 'Pending',
          total_price: 800,
          downpayment_amount: null,
          payment_method: null,
          payment_confirmed: false,
          special_instructions: null,
          hotel_preferences: null,
          started_at: null,
          completed_at: null,
          paid_at: null,
          cancelled_at: null,
          cancellation_reason: null,
          reschedule_count: 0,
          created_at: '2026-07-19T00:00:00.000Z',
          updated_at: '2026-07-19T00:00:00.000Z',
        },
      },
      error: null,
    });

    renderPage();

    await userEvent.click(await screen.findByText('Whiskers'));
    await userEvent.click(
      await screen.findByRole('button', { name: /complete consultation/i })
    );

    const dateInput = await screen.findByLabelText(/follow-up date/i);
    await userEvent.type(dateInput, '2026-08-01');
    await userEvent.click(
      screen.getByRole('button', { name: /schedule follow-up/i })
    );

    expect(await screen.findByText(/follow-up scheduled/i)).toBeInTheDocument();
  });

  it('AC-1: the status filter narrows the queue to just the selected booking status', async () => {
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

    await screen.findAllByText('Whiskers');

    await userEvent.selectOptions(
      screen.getByLabelText('Status'),
      'In Progress'
    );

    expect(screen.queryByText('Pending', { selector: 'span' })).toBeNull();
    expect(
      screen.getByText('In Progress', { selector: 'span' })
    ).toBeInTheDocument();
  });
});
