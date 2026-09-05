import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, Fragment } from 'react';
import { MemoryRouter, useLocation, useSearchParams } from 'react-router';
import { Wrench } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../shared/auth/providers/AuthProvider/AuthContext';
import * as mfaApi from '../../shared/api/mfa.api';
import * as staffApi from '../../features/staff/api/staff.api';
import * as customerApi from '../../features/customers/api/customer.api';
import { getSupabaseClient } from '../../shared/auth/api/auth.api';
import { SettingsPage } from './SettingsPage';

vi.mock('../../shared/api/mfa.api', () => ({
  getMfaStatus: vi.fn(),
  enrollMfa: vi.fn(),
  verifyMfa: vi.fn(),
  unenrollMfa: vi.fn(),
}));

vi.mock('../../features/staff/api/staff.api', () => ({
  getStaffProfile: vi.fn(),
  updateStaffProfile: vi.fn(),
  updateStaffUsername: vi.fn(),
  uploadAvatar: vi.fn(),
}));

vi.mock('../../features/customers/api/customer.api', () => ({
  getCustomerProfile: vi.fn(),
  updateCustomerProfile: vi.fn(),
}));

vi.mock('../../shared/auth/api/auth.api', () => ({
  getSupabaseClient: vi.fn(),
}));

// Custom change (Config subtiles): stand-ins for the real admin-config
// pages, which each own their own data-fetching/mocks in their own spec
// files - this file tests SettingsPage's own embedding/fullscreen-navigate
// logic, not whether e.g. AdminDiscountManagementPage itself renders
// correctly.
//
// "Discounts" here specifically reproduces the shape of the real bug: real
// pages like AdminServicesAndPackagesPage own their own `?section=` query
// param and call `setSearchParams({...})` as a wholesale replace - which
// used to wipe this page's own `?tab=`/`?target=` right out from under it.
// This stub does the same wholesale replace (its own unrelated `?foo=`
// param) so the regression test below can prove Settings' own selection
// survives it.
function EmbeddedDiscountsStub() {
  const [searchParams, setSearchParams] = useSearchParams();
  return createElement(
    Fragment,
    null,
    createElement('p', null, 'Embedded Discounts Page'),
    createElement(
      'button',
      {
        type: 'button',
        onClick: () => setSearchParams({ foo: 'bar' }),
      },
      `Change own filter (foo=${searchParams.get('foo') ?? 'none'})`
    )
  );
}

vi.mock('./configTiles.config', () => ({
  CONFIG_TILES: [
    {
      title: 'Discounts',
      description: 'Manage discounts.',
      to: '/staff/admin/discounts',
      icon: Wrench,
      Component: EmbeddedDiscountsStub,
    },
    {
      title: 'Cages',
      description: 'Manage cages.',
      to: '/staff/admin/hotel/cages',
      icon: Wrench,
      Component: () => createElement('p', null, 'Embedded Cages Page'),
    },
  ],
  SYSTEM_CONFIG_TILE: {
    title: 'System Configuration',
    description: 'Branch config.',
    to: '/staff/admin/maintenance/system-configuration',
    icon: Wrench,
    Component: () => createElement('p', null, 'Embedded System Config Page'),
  },
}));

function LocationProbe() {
  const location = useLocation();
  return createElement('p', null, `NAVIGATED_TO:${location.pathname}`);
}

function renderPage(role: 'staff' | 'customer') {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'user-1', email: 'user@example.com' },
    accessToken: 'access',
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
        createElement(
          Fragment,
          null,
          createElement(SettingsPage, { role }),
          createElement(LocationProbe)
        )
      )
    )
  );
}

async function goToSecurityTab() {
  await userEvent.click(await screen.findByRole('tab', { name: 'Security' }));
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.mocked(getSupabaseClient).mockReturnValue(null);
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: null,
      error: 'not needed for these tests',
    });
    vi.mocked(customerApi.getCustomerProfile).mockResolvedValue({
      data: null,
      error: 'not needed for these tests',
    });
  });

  afterEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it('custom change: renders full-bleed (no backdrop/dialog chrome) with a close button', async () => {
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: { role: 'Groomer', mfa_enrolled: true },
      error: null,
    });

    renderPage('staff');

    expect(
      await screen.findByRole('heading', { name: 'Settings' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Close settings' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('presentation')).not.toBeInTheDocument();
    // Nothing to pop out to its own route until a Config tile is embedded.
    expect(
      screen.queryByRole('button', { name: 'Open as a full page' })
    ).not.toBeInTheDocument();
  });

  it('custom change: the sort menu reorders the sidebar sections alphabetically', async () => {
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: { role: 'Groomer', mfa_enrolled: true },
      error: null,
    });

    renderPage('staff');
    const user = userEvent.setup();

    await screen.findByRole('tab', { name: 'Profile' });

    await user.click(
      screen.getByRole('button', { name: 'Sort settings sections' })
    );
    await user.click(
      screen.getByRole('menuitem', { name: 'Sort: Alphabetical' })
    );

    const tabLabels = screen.getAllByRole('tab').map((tab) => tab.textContent);

    expect(tabLabels).toEqual([
      'Account',
      'Preferences',
      'Profile',
      'Security',
    ]);
  });

  it('custom change: Config expands (VSCode-style) to list every admin-config page as its own sidebar subitem', async () => {
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: { role: 'Admin', mfa_enrolled: true },
      error: null,
    });

    renderPage('staff');

    await screen.findByRole('tab', { name: 'Config' });

    expect(screen.getByRole('tab', { name: 'Discounts' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Cages' })).toBeInTheDocument();
  });

  it('custom change: selecting a Config subitem embeds that page inline instead of navigating', async () => {
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: { role: 'Admin', mfa_enrolled: true },
      error: null,
    });

    renderPage('staff');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('tab', { name: 'Discounts' }));

    expect(
      await screen.findByText('Embedded Discounts Page')
    ).toBeInTheDocument();
    // The tile grid (ConfigTab) is gone - only the embedded page shows.
    expect(
      screen.queryByRole('button', { name: /^discounts/i })
    ).not.toBeInTheDocument();
    expect(screen.getByText(/^NAVIGATED_TO:/)).toHaveTextContent(
      'NAVIGATED_TO:/'
    );
    expect(screen.getByRole('tab', { name: 'Discounts' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('custom change: Fullscreen navigates to the real page once a Config subitem is active, instead of resizing the panel', async () => {
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: { role: 'Admin', mfa_enrolled: true },
      error: null,
    });

    renderPage('staff');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('tab', { name: 'Discounts' }));
    await user.click(
      await screen.findByRole('button', { name: 'Open as a full page' })
    );

    expect(screen.getByText(/^NAVIGATED_TO:/)).toHaveTextContent(
      'NAVIGATED_TO:/staff/admin/discounts'
    );
  });

  it('fix: an embedded Config page changing its own query params does not knock Settings back to Profile', async () => {
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: { role: 'Admin', mfa_enrolled: true },
      error: null,
    });

    renderPage('staff');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('tab', { name: 'Discounts' }));
    await screen.findByText('Embedded Discounts Page');

    // Simulates a real embedded page (e.g. AdminServicesAndPackagesPage)
    // calling setSearchParams({...}) as a wholesale replace for its own,
    // unrelated filter state.
    await user.click(screen.getByRole('button', { name: /Change own filter/ }));

    expect(screen.getByText('Embedded Discounts Page')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Discounts' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('button', { name: /foo=bar/ })).toBeInTheDocument();
  });

  it('custom change: Config subitems get their own Custom/Alphabetical/Recent sort, independent of the top level', async () => {
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: { role: 'Admin', mfa_enrolled: true },
      error: null,
    });

    renderPage('staff');
    const user = userEvent.setup();

    await screen.findByRole('tab', { name: 'Discounts' });

    await user.click(screen.getByRole('button', { name: 'Sort Config' }));
    await user.click(
      screen.getByRole('menuitem', { name: 'Sort: Alphabetical' })
    );

    const subitemLabels = screen
      .getAllByRole('tab')
      .filter((tab) => ['Discounts', 'Cages'].includes(tab.textContent ?? ''))
      .map((tab) => tab.textContent);

    // "Cages" < "Discounts" alphabetically, opposite of the mocked
    // CONFIG_TILES' own (Discounts-then-Cages) order.
    expect(subitemLabels).toEqual(['Cages', 'Discounts']);
  });

  it('custom change: the settings sidebar exposes a resize handle', async () => {
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: { role: 'Groomer', mfa_enrolled: true },
      error: null,
    });

    renderPage('staff');

    expect(
      await screen.findByRole('separator', { name: 'Resize settings sidebar' })
    ).toBeInTheDocument();
  });

  it('defaults to the Profile tab', async () => {
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: { role: 'Groomer', mfa_enrolled: true },
      error: null,
    });

    renderPage('staff');

    expect(await screen.findByRole('tab', { name: 'Profile' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('hides the Config tab for a non-admin staff role', async () => {
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: { role: 'Groomer', mfa_enrolled: true },
      error: null,
    });

    renderPage('staff');

    await screen.findByRole('tab', { name: 'Profile' });
    expect(
      screen.queryByRole('tab', { name: 'Config' })
    ).not.toBeInTheDocument();
  });

  it('shows the Config tab for an Admin', async () => {
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: { role: 'Admin', mfa_enrolled: true },
      error: null,
    });

    renderPage('staff');

    expect(
      await screen.findByRole('tab', { name: 'Config' })
    ).toBeInTheDocument();
  });

  it('hides the Config tab for a customer', async () => {
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: { mfa_enrolled: false },
      error: null,
    });

    renderPage('customer');

    await screen.findByRole('tab', { name: 'Profile' });
    expect(
      screen.queryByRole('tab', { name: 'Config' })
    ).not.toBeInTheDocument();
  });

  it('shows an enabled confirmation when MFA is already set up', async () => {
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: { role: 'Groomer', mfa_enrolled: true },
      error: null,
    });

    renderPage('staff');
    await goToSecurityTab();

    expect(
      await screen.findByText('MFA is enabled on your account.')
    ).toBeInTheDocument();
  });

  it('offers a Disable MFA action for an enrolled, non-mandatory role', async () => {
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: { role: 'Groomer', mfa_enrolled: true },
      error: null,
    });
    vi.mocked(mfaApi.unenrollMfa).mockResolvedValue({
      data: { removed: ['factor-1'], failed: [] },
      error: null,
    });

    renderPage('staff');
    await goToSecurityTab();

    const disableButton = await screen.findByRole('button', {
      name: /disable mfa/i,
    });
    await userEvent.click(disableButton);

    await waitFor(() =>
      expect(mfaApi.unenrollMfa).toHaveBeenCalledWith('staff', 'access')
    );
  });

  it('does not offer a Disable MFA action for a mandatory role that is already enrolled', async () => {
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: { role: 'Admin', mfa_enrolled: true },
      error: null,
    });

    renderPage('staff');
    await goToSecurityTab();

    await screen.findByText('MFA is enabled on your account.');
    expect(
      screen.queryByRole('button', { name: /disable mfa/i })
    ).not.toBeInTheDocument();
  });

  it('shows an error and keeps MFA enrolled when unenroll fails (e.g. missing aal2)', async () => {
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: { role: 'Groomer', mfa_enrolled: true },
      error: null,
    });
    vi.mocked(mfaApi.unenrollMfa).mockResolvedValue({
      data: null,
      error: 'Failed to remove MFA factor',
    });

    renderPage('staff');
    await goToSecurityTab();

    const disableButton = await screen.findByRole('button', {
      name: /disable mfa/i,
    });
    await userEvent.click(disableButton);

    expect(
      await screen.findByText('Failed to remove MFA factor')
    ).toBeInTheDocument();
  });

  it('offers optional setup for a lower-privilege staff role that is not enrolled', async () => {
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: { role: 'Cashier', mfa_enrolled: false },
      error: null,
    });
    vi.mocked(mfaApi.enrollMfa).mockResolvedValue({
      data: { totp: { qr_code: null, uri: 'otpauth://totp/example' } },
      error: null,
    });

    renderPage('staff');
    await goToSecurityTab();

    expect(
      await screen.findByText(/optional for your role/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /confirm mfa/i })
    ).toBeInTheDocument();
  });

  it('flags MFA as required but not yet set up for a mandatory staff role, without rendering its own enroll panel', async () => {
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: { role: 'Admin', mfa_enrolled: false },
      error: null,
    });

    renderPage('staff');
    await goToSecurityTab();

    expect(
      await screen.findByText(/required for your role/i)
    ).toBeInTheDocument();
    // The mandatory MfaSetupModal (rendered by StaffAuthGuard, not this page)
    // owns enrollment for Admin/Superadmin exclusively. A second enroll panel
    // here would race it - each instance's enrollMfa() call invalidates
    // whatever QR/key the user just scanned from the other one.
    expect(mfaApi.enrollMfa).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: /confirm mfa/i })
    ).not.toBeInTheDocument();
  });

  it('offers optional setup for a customer that is not enrolled', async () => {
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: { mfa_enrolled: false },
      error: null,
    });
    vi.mocked(mfaApi.enrollMfa).mockResolvedValue({
      data: { totp: { qr_code: null, uri: 'otpauth://totp/example' } },
      error: null,
    });

    renderPage('customer');
    await goToSecurityTab();

    await waitFor(() =>
      expect(mfaApi.getMfaStatus).toHaveBeenCalledWith('customer', 'access')
    );
    expect(
      await screen.findByText(/optional for your role/i)
    ).toBeInTheDocument();
  });
});
