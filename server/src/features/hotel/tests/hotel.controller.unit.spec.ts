import type { Response } from 'express';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  cageGridController,
  cageOccupantsController,
  updateCageController,
} from '../hotel.controller.ts';
import * as cageStatusService from '../services/cageStatus.service.ts';
import { listCageOccupants } from '../services/cageOccupants.service.ts';
import type { AuthenticatedRequest } from '../../../shared/shared.types.ts';

// Only updateCageController is under test here - every other export from
// cageStatus.service.ts is mocked as an unused vi.fn() purely so the
// controller module can import them without error.
vi.mock('../services/cageStatus.service.ts', () => ({
  archiveCage: vi.fn(),
  createCage: vi.fn(),
  getAvailableCageCountsBySize: vi.fn(),
  getCageGrid: vi.fn(),
  hardDeleteCage: vi.fn(),
  listArchivedCages: vi.fn(),
  restoreCage: vi.fn(),
  setCageMaintenanceStatus: vi.fn(),
  updateCage: vi.fn(),
}));

vi.mock('../services/cageOccupants.service.ts', () => ({
  listCageOccupants: vi.fn(),
}));

function mockResponse() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

describe('updateCageController (Superadmin cage branch reassignment)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 and never calls updateCage when a non-Superadmin includes branch_id', async () => {
    const req = {
      params: { id: 'cage-1' },
      body: { branch_id: '11111111-1111-1111-8111-111111111111' },
      user: { sub: 'staff-1', branch_id: 'branch-1', role: 'Admin' },
    } as unknown as AuthenticatedRequest;
    const res = mockResponse();

    await updateCageController(req, res);

    expect(cageStatusService.updateCage).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('allows Superadmin to reassign a cage to a different branch', async () => {
    const req = {
      params: { id: 'cage-1' },
      body: { branch_id: '11111111-1111-1111-8111-111111111111' },
      user: { sub: 'staff-1', branch_id: 'branch-1', role: 'Superadmin' },
    } as unknown as AuthenticatedRequest;
    const res = mockResponse();

    vi.mocked(cageStatusService.updateCage).mockResolvedValue({
      id: 'cage-1',
      branch_id: '11111111-1111-1111-8111-111111111111',
    } as any);

    await updateCageController(req, res);

    expect(cageStatusService.updateCage).toHaveBeenCalledWith(
      expect.objectContaining({
        cageId: 'cage-1',
        branchId: 'branch-1',
        newBranchId: '11111111-1111-1111-8111-111111111111',
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('behaves exactly as before for either role when branch_id is omitted', async () => {
    const req = {
      params: { id: 'cage-1' },
      body: { cage_label: 'Renamed' },
      user: { sub: 'staff-1', branch_id: 'branch-1', role: 'Admin' },
    } as unknown as AuthenticatedRequest;
    const res = mockResponse();

    vi.mocked(cageStatusService.updateCage).mockResolvedValue({
      id: 'cage-1',
      cage_label: 'Renamed',
    } as any);

    await updateCageController(req, res);

    expect(cageStatusService.updateCage).toHaveBeenCalledWith(
      expect.objectContaining({ newBranchId: undefined })
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// Bug fix: a Superadmin is not tied to one branch, so the Cage Occupancy
// page's cage list (and who is in each cage) must be readable for another
// branch, or for every branch at once. Everyone else stays on their own.
describe('cage grid / occupants branch scope', () => {
  const OTHER_BRANCH = '22222222-2222-4222-8222-222222222222';

  function request(role: string, branchQuery?: string) {
    return {
      params: {},
      query: branchQuery === undefined ? {} : { branch_id: branchQuery },
      user: { sub: 'staff-1', branch_id: 'branch-1', role },
    } as unknown as AuthenticatedRequest;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cageStatusService.getCageGrid).mockResolvedValue({
      S: [],
      M: [],
      L: [],
      XL: [],
    });
    vi.mocked(listCageOccupants).mockResolvedValue([]);
  });

  it('a Superadmin can read every branch at once', async () => {
    await cageGridController(request('Superadmin', 'all'), mockResponse());
    await cageOccupantsController(request('Superadmin', 'all'), mockResponse());

    expect(cageStatusService.getCageGrid).toHaveBeenCalledWith(null);
    expect(listCageOccupants).toHaveBeenCalledWith(null);
  });

  it('a Superadmin can read one other branch', async () => {
    await cageGridController(
      request('Superadmin', OTHER_BRANCH),
      mockResponse()
    );
    await cageOccupantsController(
      request('Superadmin', OTHER_BRANCH),
      mockResponse()
    );

    expect(cageStatusService.getCageGrid).toHaveBeenCalledWith(OTHER_BRANCH);
    expect(listCageOccupants).toHaveBeenCalledWith(OTHER_BRANCH);
  });

  it('a Superadmin who asks for nothing in particular gets their own branch', async () => {
    await cageGridController(request('Superadmin'), mockResponse());

    expect(cageStatusService.getCageGrid).toHaveBeenCalledWith('branch-1');
  });

  it('anyone else is kept to their own branch whatever they ask for', async () => {
    for (const branchQuery of ['all', OTHER_BRANCH]) {
      await cageGridController(
        request('Receptionist', branchQuery),
        mockResponse()
      );
      await cageOccupantsController(
        request('Admin', branchQuery),
        mockResponse()
      );
    }

    expect(cageStatusService.getCageGrid).toHaveBeenCalledTimes(2);
    expect(listCageOccupants).toHaveBeenCalledTimes(2);
    for (const call of [
      ...vi.mocked(cageStatusService.getCageGrid).mock.calls,
      ...vi.mocked(listCageOccupants).mock.calls,
    ]) {
      expect(call).toEqual(['branch-1']);
    }
  });

  it('rejects a branch_id that is not a branch id', async () => {
    const res = mockResponse();

    await cageGridController(request('Superadmin', 'not-a-uuid'), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(cageStatusService.getCageGrid).not.toHaveBeenCalled();
  });
});
