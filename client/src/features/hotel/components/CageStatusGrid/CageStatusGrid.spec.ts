import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCageGrid, setCageMaintenanceStatus } from '../../api/hotel.api';
import { CageStatusGrid } from './CageStatusGrid';

vi.mock('../../api/hotel.api', () => ({
  getCageGrid: vi.fn(),
  setCageMaintenanceStatus: vi.fn(),
}));

const GRID = {
  S: [{ id: 'cage-1', cage_label: 'Makati-S-01', status: 'Available' }],
  M: [],
  L: [],
  XL: [],
};

function renderGrid(viewerRole: string) {
  return render(
    createElement(CageStatusGrid, {
      accessToken: 'token',
      viewerRole,
    })
  );
}

describe('CageStatusGrid - cage maintenance overflow menu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCageGrid).mockResolvedValue({
      data: GRID as never,
      error: null,
    });
  });

  it('does not show the overflow menu for a non-Admin viewer', async () => {
    renderGrid('Receptionist');

    await screen.findByText('Makati-S-01');

    expect(
      screen.queryByLabelText('More options for Makati-S-01')
    ).not.toBeInTheDocument();
  });

  it('shows "Mark Under Maintenance" inside the "..." menu for an Admin viewer, not as a standalone button', async () => {
    renderGrid('Admin');

    await screen.findByText('Makati-S-01');

    expect(
      screen.queryByRole('button', { name: 'Mark Under Maintenance' })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('More options for Makati-S-01'));

    expect(
      screen.getByRole('menuitem', { name: 'Mark Under Maintenance' })
    ).toBeInTheDocument();
  });

  it('calls setCageMaintenanceStatus when the menu item is chosen', async () => {
    vi.mocked(setCageMaintenanceStatus).mockResolvedValue({
      data: { ...GRID.S[0], status: 'Under Maintenance' },
      error: null,
    } as never);

    renderGrid('Superadmin');

    await screen.findByText('Makati-S-01');

    fireEvent.click(screen.getByLabelText('More options for Makati-S-01'));
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Mark Under Maintenance' })
    );

    await waitFor(() =>
      expect(setCageMaintenanceStatus).toHaveBeenCalledWith(
        'cage-1',
        'Under Maintenance',
        'token'
      )
    );
  });
});
