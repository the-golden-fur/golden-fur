import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../../staff/api/staff.api';
import type { StaffProfile, StaffRole } from '../../../staff/staff.types';
import * as landingApi from '../../api/landing.api';
import {
  DEFAULT_LANDING_IMAGES,
  DEFAULT_LANDING_TEXT,
} from '../../landing.content';
import type {
  LandingAdminContent,
  LandingContentItem,
  LandingReview,
} from '../../landing.types';
import { LandingPageConfigurationPage } from './LandingPageConfigurationPage';

vi.mock('../../../staff/api/staff.api', () => ({
  listStaff: vi.fn(),
}));

vi.mock('../../api/landing.api', () => ({
  getLandingAdminContent: vi.fn(),
  updateLandingContent: vi.fn(),
  updateLandingSection: vi.fn(),
  uploadLandingImage: vi.fn(),
  resetLandingImage: vi.fn(),
  createLandingReview: vi.fn(),
  updateLandingReview: vi.fn(),
  deleteLandingReview: vi.fn(),
}));

const UPDATED_AT = '2026-10-17T00:00:00.000Z';

function item(
  key: string,
  kind: 'text' | 'image',
  value: string | null
): LandingContentItem {
  return { key, kind, value, updated_at: UPDATED_AT };
}

const REVIEW: LandingReview = {
  id: 'r-1',
  quote: 'Rio loves it here.',
  name: 'Andrea Salcedo',
  detail: 'Grooming · Makati',
  rating: 5,
  sort_order: 1,
  is_active: true,
  created_at: UPDATED_AT,
  updated_at: UPDATED_AT,
};

function adminContent(): LandingAdminContent {
  return {
    content: [
      ...Object.entries(DEFAULT_LANDING_TEXT).map(([key, value]) =>
        item(key, 'text', value)
      ),
      ...Object.keys(DEFAULT_LANDING_IMAGES).map((key) =>
        item(key, 'image', null)
      ),
    ],
    sections: (
      [
        'hero',
        'services',
        'features',
        'reviews',
        'story',
        'visit',
        'cta',
      ] as const
    ).map((key) => ({ key, is_visible: true, updated_at: UPDATED_AT })),
    reviews: [REVIEW],
  };
}

function buildViewer(role: StaffRole): StaffProfile {
  return {
    id: 'staff-1',
    branch_id: 'branch-makati',
    role,
    username: 'viewer',
    registered_email: 'viewer@example.com',
    display_name: 'Signed-in Viewer',
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
      { initialEntries: ['/staff/admin/maintenance/landing-page'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/staff/admin/maintenance/landing-page',
            element: createElement(LandingPageConfigurationPage),
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

async function panel(title: string) {
  return (await screen.findByRole('region', { name: title })) as HTMLElement;
}

describe('LandingPageConfigurationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Superadmin')],
      error: null,
    });
    vi.mocked(landingApi.getLandingAdminContent).mockResolvedValue({
      data: adminContent(),
      error: null,
    });
  });

  it('redirects anyone who is not a Superadmin to Settings', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Admin')],
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Settings page')).toBeInTheDocument();
    expect(landingApi.getLandingAdminContent).not.toHaveBeenCalled();
  });

  it('saves only the fields that changed in a section', async () => {
    vi.mocked(landingApi.updateLandingContent).mockResolvedValue({
      data: [item('hero.title_lead', 'text', 'Love as deep as')],
      error: null,
    });

    renderPage();
    const user = userEvent.setup();
    const hero = await panel('Hero');
    const save = within(hero).getByRole('button', { name: 'Save Hero' });

    expect(save).toBeDisabled();

    const headline = within(hero).getByLabelText('Headline');
    await user.clear(headline);
    await user.type(headline, 'Love as deep as');
    await user.click(save);

    expect(landingApi.updateLandingContent).toHaveBeenCalledWith('token', [
      { key: 'hero.title_lead', value: 'Love as deep as' },
    ]);
    expect(await screen.findByText('Hero saved.')).toBeInTheDocument();
    expect(save).toBeDisabled();
  });

  it('will not save a blank field', async () => {
    renderPage();
    const user = userEvent.setup();
    const cta = await panel('Closing call to action');

    await user.clear(within(cta).getByLabelText('Title'));

    expect(
      within(cta).getByRole('button', { name: 'Save Closing call to action' })
    ).toBeDisabled();
    expect(
      within(cta).getByText('Fill in every field before saving.')
    ).toBeInTheDocument();
  });

  it('hides a section', async () => {
    vi.mocked(landingApi.updateLandingSection).mockResolvedValue({
      data: { key: 'reviews', is_visible: false, updated_at: UPDATED_AT },
      error: null,
    });

    renderPage();
    const user = userEvent.setup();
    const reviews = await panel('Customer reviews');

    await user.click(within(reviews).getByLabelText('Shown on the page'));

    expect(landingApi.updateLandingSection).toHaveBeenCalledWith(
      'token',
      'reviews',
      false
    );
    expect(
      await screen.findByText(
        'Customer reviews is hidden from the landing page.'
      )
    ).toBeInTheDocument();
    expect(
      within(reviews).getByLabelText('Shown on the page')
    ).not.toBeChecked();
  });

  it('the footer has no show/hide switch', async () => {
    renderPage();
    const footer = await panel('Footer');

    expect(
      within(footer).queryByLabelText('Shown on the page')
    ).not.toBeInTheDocument();
  });

  it('uploads a replacement photo and offers to go back to the original', async () => {
    vi.mocked(landingApi.uploadLandingImage).mockResolvedValue({
      data: item('hero.image', 'image', 'https://cdn.example/hero.png'),
      error: null,
    });

    renderPage();
    const user = userEvent.setup();
    const hero = await panel('Hero');
    const file = new File(['png'], 'hero.png', { type: 'image/png' });

    expect(
      within(hero).queryByRole('button', { name: 'Use original' })
    ).not.toBeInTheDocument();

    await user.upload(
      within(hero).getByLabelText('Replace Background photo'),
      file
    );

    expect(landingApi.uploadLandingImage).toHaveBeenCalledWith(
      'token',
      'hero.image',
      file
    );
    expect(
      await within(hero).findByRole('button', { name: 'Use original' })
    ).toBeInTheDocument();
  });

  it('lists the reviews and adds one', async () => {
    vi.mocked(landingApi.createLandingReview).mockResolvedValue({
      data: {
        ...REVIEW,
        id: 'r-2',
        quote: 'Great hotel.',
        name: 'Ana',
        detail: '',
        rating: 4,
        sort_order: 2,
      },
      error: null,
    });

    renderPage();
    const user = userEvent.setup();
    const list = await screen.findByRole('list', { name: 'Reviews' });
    expect(within(list).getByText('“Rio loves it here.”')).toBeInTheDocument();

    const reviews = await panel('Customer reviews');
    await user.type(
      within(reviews).getAllByLabelText('Review').at(-1)!,
      'Great hotel.'
    );
    await user.type(within(reviews).getAllByLabelText('Name').at(-1)!, 'Ana');
    await user.selectOptions(
      within(reviews).getAllByLabelText('Stars').at(-1)!,
      '4'
    );
    await user.click(
      within(reviews).getByRole('button', { name: 'Add review' })
    );

    expect(landingApi.createLandingReview).toHaveBeenCalledWith('token', {
      quote: 'Great hotel.',
      name: 'Ana',
      detail: '',
      rating: 4,
    });
    expect(await within(list).findByText('“Great hotel.”')).toBeInTheDocument();
  });
});
