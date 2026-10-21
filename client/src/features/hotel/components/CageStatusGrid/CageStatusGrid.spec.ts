import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  closeCageTemporarily,
  getCageGrid,
  reopenCage,
  setCageMaintenanceStatus,
} from '../../api/hotel.api';
import { CageStatusGrid } from './CageStatusGrid';

vi.mock('../../api/hotel.api', () => ({
  getCageGrid: vi.fn(),
  setCageMaintenanceStatus: vi.fn(),
  closeCageTemporarily: vi.fn(),
  reopenCage: vi.fn(),
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

  it('does not show the overflow menu for a non-front-desk viewer', async () => {
    renderGrid('Groomer');

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

describe('CageStatusGrid - cage size warning', () => {
  const SIZED_GRID = {
    S: [
      {
        id: 'cage-s',
        cage_label: 'Makati-S-01',
        size: 'S',
        status: 'Available',
      },
    ],
    M: [],
    L: [
      {
        id: 'cage-l',
        cage_label: 'Makati-L-01',
        size: 'L',
        status: 'Available',
      },
    ],
    XL: [],
  };

  function renderSizedGrid(selectedCageId: string, petSize?: string) {
    vi.mocked(getCageGrid).mockResolvedValue({
      data: SIZED_GRID as never,
      error: null,
    });

    return render(
      createElement(CageStatusGrid, {
        accessToken: 'token',
        viewerRole: 'Front Desk',
        selectedCageId,
        petSize,
      })
    );
  }

  it('warns when the selected cage is smaller than the pet', async () => {
    renderSizedGrid('cage-s', 'L');

    expect(await screen.findByText('Too small')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Cage Makati-S-01 is size S, but this pet is size L.'
    );
  });

  it('warns when the selected cage is bigger than the pet', async () => {
    renderSizedGrid('cage-l', 'S');

    expect(await screen.findByText('Too large')).toBeInTheDocument();
  });

  it('shows no warning when the selected cage matches the pet size', async () => {
    renderSizedGrid('cage-l', 'L');

    await screen.findByText('Makati-L-01');

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText('Too small')).not.toBeInTheDocument();
    expect(screen.queryByText('Too large')).not.toBeInTheDocument();
  });

  it('shows no warning when no pet size is given (browse-only pages)', async () => {
    renderSizedGrid('cage-s');

    await screen.findByText('Makati-S-01');

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

// Custom change (front-desk cage override).
describe('CageStatusGrid - close to customers override', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockGrid(closedUntil: string | null) {
    vi.mocked(getCageGrid).mockResolvedValue({
      data: {
        ...GRID,
        S: [{ ...GRID.S[0], closed_until: closedUntil }],
      } as never,
      error: null,
    });
  }

  it.each(['Receptionist', 'Front Desk'])(
    'lets a %s close an Available cage for a chosen duration',
    async (role) => {
      mockGrid(null);
      vi.mocked(closeCageTemporarily).mockResolvedValue({
        data: GRID.S[0],
        error: null,
      } as never);

      renderGrid(role);
      await screen.findByText('Makati-S-01');

      fireEvent.click(screen.getByLabelText('More options for Makati-S-01'));
      expect(
        screen.queryByRole('menuitem', { name: 'Mark Under Maintenance' })
      ).not.toBeInTheDocument();
      fireEvent.click(
        screen.getByRole('menuitem', { name: 'Close to customers' })
      );

      fireEvent.click(screen.getByLabelText('1 hr'));
      fireEvent.click(screen.getByRole('button', { name: 'Close cage' }));

      await waitFor(() =>
        expect(closeCageTemporarily).toHaveBeenCalledWith('cage-1', 60, 'token')
      );
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      );
    }
  );

  it('accepts a custom number of minutes', async () => {
    mockGrid(null);
    vi.mocked(closeCageTemporarily).mockResolvedValue({
      data: GRID.S[0],
      error: null,
    } as never);

    renderGrid('Receptionist');
    await screen.findByText('Makati-S-01');

    fireEvent.click(screen.getByLabelText('More options for Makati-S-01'));
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Close to customers' })
    );
    fireEvent.click(screen.getByLabelText('Custom'));
    fireEvent.change(screen.getByLabelText('Minutes'), {
      target: { value: '3' },
    });
    expect(screen.getByRole('button', { name: 'Close cage' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Minutes'), {
      target: { value: '90' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Close cage' }));

    await waitFor(() =>
      expect(closeCageTemporarily).toHaveBeenCalledWith('cage-1', 90, 'token')
    );
  });

  it('shows the closed tag and offers Reopen now on a closed cage', async () => {
    mockGrid(new Date(Date.now() + 30 * 60_000).toISOString());
    vi.mocked(reopenCage).mockResolvedValue({
      data: GRID.S[0],
      error: null,
    } as never);

    renderGrid('Receptionist');
    await screen.findByText('Makati-S-01');

    expect(screen.getByText(/^Closed until/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('More options for Makati-S-01'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reopen now' }));

    await waitFor(() =>
      expect(reopenCage).toHaveBeenCalledWith('cage-1', 'token')
    );
  });

  it('treats an expired closure as open', async () => {
    mockGrid(new Date(Date.now() - 60_000).toISOString());

    renderGrid('Receptionist');
    await screen.findByText('Makati-S-01');

    expect(screen.queryByText(/^Closed until/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('More options for Makati-S-01'));
    expect(
      screen.getByRole('menuitem', { name: 'Close to customers' })
    ).toBeInTheDocument();
  });
});
