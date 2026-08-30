import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../shared/shared.types.ts';
import { getDailySalesReport } from './services/dailySalesReport.service.ts';
import { getCageOccupancyReport } from './services/cageOccupancy.service.ts';
import { listTransactionHistory } from './services/transactionHistory.service.ts';
import { getAnalyticsSummary } from './services/analytics.service.ts';

function sendServiceError(res: Response, error: unknown) {
  const statusCode =
    (error as Error & { statusCode?: number }).statusCode ?? 500;
  const message =
    statusCode === 500
      ? 'Internal server error'
      : ((error as Error).message ?? 'Request failed');

  return res.status(statusCode).json({ error: message });
}

function queryParam(
  req: AuthenticatedRequest,
  name: string
): string | undefined {
  const value = req.query[name];
  return typeof value === 'string' ? value : undefined;
}

export async function dailySalesReportController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterRole = req.user?.role;
  const requesterBranchId = req.user?.branch_id;

  if (!requesterRole || !requesterBranchId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const reportDate = queryParam(req, 'report_date');

  if (!reportDate) {
    return res.status(400).json({ error: 'report_date is required' });
  }

  try {
    const report = await getDailySalesReport({
      requesterRole,
      requesterBranchId,
      branchId: queryParam(req, 'branch_id') ?? null,
      reportDate,
    });

    return res.status(200).json({ report });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function cageOccupancyReportController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterRole = req.user?.role;
  const requesterBranchId = req.user?.branch_id;

  if (!requesterRole || !requesterBranchId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const rows = await getCageOccupancyReport({
      requesterRole,
      requesterBranchId,
      branchId: queryParam(req, 'branch_id') ?? null,
    });

    return res.status(200).json({ rows });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function transactionHistoryController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterRole = req.user?.role;
  const requesterBranchId = req.user?.branch_id;

  if (!requesterRole || !requesterBranchId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Non-Superadmin is always scoped to their own branch, regardless of what
  // (if anything) they pass - only a Superadmin may query a specific branch
  // or omit the filter to see every branch's transactions.
  const requestedBranchId = queryParam(req, 'branch_id');
  const branchId =
    requesterRole === 'Superadmin' ? requestedBranchId : requesterBranchId;

  try {
    const transactions = await listTransactionHistory({
      branchId,
      customerId: queryParam(req, 'customer_id'),
      petId: queryParam(req, 'pet_id'),
      dateFrom: queryParam(req, 'date_from'),
      dateTo: queryParam(req, 'date_to'),
      serviceCategory: queryParam(req, 'service_category'),
      transactionType: queryParam(req, 'transaction_type'),
      paymentChoice: queryParam(req, 'payment_choice'),
    });

    return res.status(200).json({ transactions });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

/**
 * Custom change (P-1 roadmap item: transaction history visibility) - the
 * customer-facing counterpart to transactionHistoryController above. No
 * staff role or branch_id involved: req.user.sub is trusted directly as the
 * customer_id filter (a customer JWT can only ever be their own), same
 * ownership-scoping convention booking.service.ts's listBookings uses for a
 * non-staff caller.
 */
export async function customerTransactionHistoryController(
  req: AuthenticatedRequest,
  res: Response
) {
  const customerId = req.user?.sub;

  if (!customerId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const transactions = await listTransactionHistory({
      customerId,
      petId: queryParam(req, 'pet_id'),
      dateFrom: queryParam(req, 'date_from'),
      dateTo: queryParam(req, 'date_to'),
      serviceCategory: queryParam(req, 'service_category'),
      transactionType: queryParam(req, 'transaction_type'),
      paymentChoice: queryParam(req, 'payment_choice'),
    });

    return res.status(200).json({ transactions });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function analyticsSummaryController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterRole = req.user?.role;

  if (!requesterRole) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const summary = await getAnalyticsSummary({
      requesterRole,
      branchId: queryParam(req, 'branch_id') ?? null,
      timeFilter: queryParam(req, 'time_filter') ?? 'today',
    });

    return res.status(200).json({ summary });
  } catch (error) {
    return sendServiceError(res, error);
  }
}
