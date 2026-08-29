import type {
  CheckoutPreview,
  CheckoutRequest,
  CheckoutResponse,
  MiscSaleRequest,
  MiscSaleResponse,
  Transaction,
  UpdateMiscSaleRequest,
} from '../billing.types';

interface BillingApiResult<T> {
  data: T | null;
  error: string | null;
}

// billing.routes.ts (server) is mounted at the server root, same as
// hotel.routes.ts / discounts.routes.ts.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

async function parseError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return body?.error ?? 'Request failed. Please try again.';
}

async function parseBody<T>(response: Response): Promise<BillingApiResult<T>> {
  const body = (await response.json().catch(() => null)) as T | null;

  if (body === null) {
    return { data: null, error: 'Request failed. Please try again.' };
  }

  return { data: body, error: null };
}

function jsonHeaders(accessToken: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };
}

function authHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

export async function getPaymongoFeeRate(
  accessToken: string
): Promise<BillingApiResult<number>> {
  const response = await fetch(`${API_BASE_URL}/billing/paymongo/fee-rate`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ feePercent: number }>(response);
  return { data: result.data?.feePercent ?? null, error: result.error };
}

export async function previewCheckout(
  bookingId: string,
  eligibility: { seniorCitizenEligible: boolean; pwdEligible: boolean },
  accessToken: string
): Promise<BillingApiResult<CheckoutPreview>> {
  const params = new URLSearchParams();
  if (eligibility.seniorCitizenEligible) {
    params.set('senior_citizen_eligible', 'true');
  }
  if (eligibility.pwdEligible) {
    params.set('pwd_eligible', 'true');
  }
  const query = params.toString() ? `?${params.toString()}` : '';

  const response = await fetch(
    `${API_BASE_URL}/billing/checkout/${bookingId}/preview${query}`,
    { headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return parseBody<CheckoutPreview>(response);
}

export async function checkoutBooking(
  payload: CheckoutRequest,
  accessToken: string
): Promise<BillingApiResult<CheckoutResponse>> {
  const response = await fetch(`${API_BASE_URL}/billing/checkout`, {
    method: 'POST',
    headers: jsonHeaders(accessToken),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return parseBody<CheckoutResponse>(response);
}

export async function createMiscSale(
  payload: MiscSaleRequest,
  accessToken: string
): Promise<BillingApiResult<MiscSaleResponse>> {
  const response = await fetch(`${API_BASE_URL}/billing/misc-sale`, {
    method: 'POST',
    headers: jsonHeaders(accessToken),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return parseBody<MiscSaleResponse>(response);
}

export async function listMiscSales(
  accessToken: string
): Promise<BillingApiResult<Transaction[]>> {
  const response = await fetch(`${API_BASE_URL}/billing/misc-sale`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ transactions: Transaction[] }>(response);
  return { data: result.data?.transactions ?? null, error: result.error };
}

/** §6 (down-payment slot gate): every payment recorded against one
 * booking, oldest first - powers the Payments Queue row's "View payments"
 * panel (date, amount, method, status, full vs down payment). */
export async function listBookingTransactions(
  bookingId: string,
  accessToken: string
): Promise<BillingApiResult<Transaction[]>> {
  const response = await fetch(
    `${API_BASE_URL}/billing/booking/${bookingId}/transactions`,
    { headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ transactions: Transaction[] }>(response);
  return { data: result.data?.transactions ?? null, error: result.error };
}

export async function getMiscSale(
  transactionId: string,
  accessToken: string
): Promise<BillingApiResult<MiscSaleResponse>> {
  const response = await fetch(
    `${API_BASE_URL}/billing/misc-sale/${transactionId}`,
    { headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return parseBody<MiscSaleResponse>(response);
}

export async function updateMiscSale(
  transactionId: string,
  payload: UpdateMiscSaleRequest,
  accessToken: string
): Promise<BillingApiResult<MiscSaleResponse>> {
  const response = await fetch(
    `${API_BASE_URL}/billing/misc-sale/${transactionId}`,
    {
      method: 'PATCH',
      headers: jsonHeaders(accessToken),
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return parseBody<MiscSaleResponse>(response);
}

export async function deleteMiscSale(
  transactionId: string,
  accessToken: string
): Promise<BillingApiResult<null>> {
  const response = await fetch(
    `${API_BASE_URL}/billing/misc-sale/${transactionId}`,
    { method: 'DELETE', headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return { data: null, error: null };
}
