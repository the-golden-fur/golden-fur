import type {
  CreateFaqPayload,
  FaqItem,
  PublicFaqItem,
  UpdateFaqPayload,
} from '../faq.types';

export interface FaqApiResult<T> {
  data: T | null;
  error: string | null;
}

// server/src/features/faq/faq.routes.ts, mounted at the server root like
// every other route file.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

const GENERIC_ERROR = 'Something went wrong. Please try again.';

async function parseError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return body?.error ?? GENERIC_ERROR;
}

function jsonHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

/**
 * The FAQs the help mascot shows, already filtered to the shown ones and in
 * order. No auth header, deliberately: the mascot is on the marketing pages
 * too, in front of visitors who haven't logged in.
 *
 * Never throws - the mascot falls back to its built-in FAQs on any error,
 * including a network failure or a reply that isn't the list (e.g. the SPA's
 * own HTML when the dev proxy isn't forwarding the route).
 */
export async function fetchPublicFaqs(): Promise<
  FaqApiResult<PublicFaqItem[]>
> {
  try {
    const response = await fetch(`${API_BASE_URL}/public/faqs`);

    if (!response.ok) {
      return { data: null, error: await parseError(response) };
    }

    const body = (await response.json().catch(() => null)) as {
      faqs?: PublicFaqItem[];
    } | null;

    if (!body || !Array.isArray(body.faqs)) {
      return { data: null, error: GENERIC_ERROR };
    }

    return { data: body.faqs, error: null };
  } catch {
    return { data: null, error: GENERIC_ERROR };
  }
}

/** Every FAQ, hidden ones included - Superadmin settings screen. */
export async function listFaqs(
  accessToken: string
): Promise<FaqApiResult<FaqItem[]>> {
  const response = await fetch(`${API_BASE_URL}/maintenance/faqs`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const body = (await response.json().catch(() => null)) as {
    faqs?: FaqItem[];
  } | null;

  return body?.faqs
    ? { data: body.faqs, error: null }
    : { data: null, error: GENERIC_ERROR };
}

async function faqMutation(
  url: string,
  init: RequestInit
): Promise<FaqApiResult<FaqItem>> {
  const response = await fetch(url, init);

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const body = (await response.json().catch(() => null)) as {
    faq?: FaqItem;
  } | null;

  return body?.faq
    ? { data: body.faq, error: null }
    : { data: null, error: GENERIC_ERROR };
}

export function createFaq(
  accessToken: string,
  payload: CreateFaqPayload
): Promise<FaqApiResult<FaqItem>> {
  return faqMutation(`${API_BASE_URL}/maintenance/faqs`, {
    method: 'POST',
    headers: jsonHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export function updateFaq(
  faqId: string,
  accessToken: string,
  payload: UpdateFaqPayload
): Promise<FaqApiResult<FaqItem>> {
  return faqMutation(`${API_BASE_URL}/maintenance/faqs/${faqId}`, {
    method: 'PATCH',
    headers: jsonHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function deleteFaq(
  faqId: string,
  accessToken: string
): Promise<{ error: string | null }> {
  const response = await fetch(`${API_BASE_URL}/maintenance/faqs/${faqId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  return { error: response.ok ? null : await parseError(response) };
}
