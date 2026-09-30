import type { Response } from 'express';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { updateCageController } from '../hotel.controller.ts';
import * as cageStatusService from '../services/cageStatus.service.ts';
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
