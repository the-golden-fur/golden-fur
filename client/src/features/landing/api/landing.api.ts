import {
  resolveLanding,
  type ResolvedLanding,
} from '../landing.content';
import type {
  CreateLandingReviewPayload,
  LandingAdminContent,
  LandingContentItem,
  LandingReview,
  LandingSection,
  LandingSectionKey,
  PublicBranch,
  PublicLandingContent,
  UpdateLandingReviewPayload,
} from '../landing.types';

export interface LandingApiResult<T> {
  data: T | null;
  error: string | null;
}

// server/src/features/landing/landing.routes.ts, mounted at the server root
// like every other route file.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

const GENERIC_ERROR = 'Something went wrong. Please try again.';

/** How long the landing page waits for its content before showing the
 * built-in defaults instead (a cold-started server can take far longer). */
export const LANDING_LOAD_TIMEOUT_MS = 2500;

async function parseError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return body?.error ?? GENERIC_ERROR;
}

function authHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

function jsonHeaders(accessToken: string): HeadersInit {
  return { ...authHeaders(accessToken), 'Content-Type': 'application/json' };
}

/**
 * A public read for the landing page. No auth header, deliberately - the
 * page is shown to visitors who haven't logged in. Never throws: any error,
 * including a reply that isn't JSON (e.g. the SPA's own HTML when the dev
 * proxy isn't forwarding the route), comes back as `error`.
 */
async function publicRead<T>(
  path: string,
  isValid: (body: unknown) => body is T
): Promise<LandingApiResult<T>> {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`);

    if (!response.ok) {
      return { data: null, error: await parseError(response) };
    }

    const body: unknown = await response.json().catch(() => null);

    return isValid(body)
      ? { data: body, error: null }
      : { data: null, error: GENERIC_ERROR };
  } catch {
    return { data: null, error: GENERIC_ERROR };
  }
}

function isPublicLandingContent(body: unknown): body is PublicLandingContent {
  const value = body as PublicLandingContent | null;
  return (
    !!value &&
    typeof value.content === 'object' &&
    value.content !== null &&
    typeof value.sections === 'object' &&
    value.sections !== null &&
    Array.isArray(value.reviews)
  );
}

export async function fetchPublicLanding(): Promise<
  LandingApiResult<PublicLandingContent>
> {
  return publicRead('/public/landing', isPublicLandingContent);
}

export async function fetchPublicBranches(): Promise<
  LandingApiResult<PublicBranch[]>
> {
  const result = await publicRead(
    '/public/branches',
    (body): body is { branches: PublicBranch[] } =>
      Array.isArray((body as { branches?: unknown } | null)?.branches)
  );

  return result.data
    ? { data: result.data.branches, error: null }
    : { data: null, error: result.error };
}

/**
 * Everything the landing page shows, already laid over the built-in
 * defaults. Waits at most `timeoutMs` - whatever hasn't arrived by then
 * falls back to the defaults, so a slow or sleeping server never leaves the
 * page blank.
 */
export async function loadLandingPage(
  timeoutMs = LANDING_LOAD_TIMEOUT_MS
): Promise<ResolvedLanding> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });

  const [landing, branches] = await Promise.all([
    Promise.race([fetchPublicLanding(), timeout]),
    Promise.race([fetchPublicBranches(), timeout]),
  ]);
  clearTimeout(timer);

  return resolveLanding(landing?.data ?? null, branches?.data ?? null);
}

/** Every slot, section and review, hidden ones included - Superadmin
 * settings screen. */
export async function getLandingAdminContent(
  accessToken: string
): Promise<LandingApiResult<LandingAdminContent>> {
  const response = await fetch(`${API_BASE_URL}/maintenance/landing`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const body: unknown = await response.json().catch(() => null);
  const value = body as LandingAdminContent | null;

  return value &&
    Array.isArray(value.content) &&
    Array.isArray(value.sections) &&
    Array.isArray(value.reviews)
    ? { data: value, error: null }
    : { data: null, error: GENERIC_ERROR };
}

/** Sends a request and pulls `field` out of the JSON reply. */
async function mutation<T>(
  url: string,
  init: RequestInit,
  field: string
): Promise<LandingApiResult<T>> {
  const response = await fetch(url, init);

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const body = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const value = body?.[field];

  return value !== undefined && value !== null
    ? { data: value as T, error: null }
    : { data: null, error: GENERIC_ERROR };
}

export function updateLandingContent(
  accessToken: string,
  updates: Array<{ key: string; value: string }>
): Promise<LandingApiResult<LandingContentItem[]>> {
  return mutation(
    `${API_BASE_URL}/maintenance/landing/content`,
    {
      method: 'PATCH',
      headers: jsonHeaders(accessToken),
      body: JSON.stringify({ updates }),
    },
    'content'
  );
}

export function updateLandingSection(
  accessToken: string,
  key: LandingSectionKey,
  isVisible: boolean
): Promise<LandingApiResult<LandingSection>> {
  return mutation(
    `${API_BASE_URL}/maintenance/landing/sections/${key}`,
    {
      method: 'PATCH',
      headers: jsonHeaders(accessToken),
      body: JSON.stringify({ is_visible: isVisible }),
    },
    'section'
  );
}

export function uploadLandingImage(
  accessToken: string,
  key: string,
  file: File
): Promise<LandingApiResult<LandingContentItem>> {
  const formData = new FormData();
  formData.append('image', file);

  return mutation(
    `${API_BASE_URL}/maintenance/landing/images/${encodeURIComponent(key)}`,
    { method: 'POST', headers: authHeaders(accessToken), body: formData },
    'item'
  );
}

export function resetLandingImage(
  accessToken: string,
  key: string
): Promise<LandingApiResult<LandingContentItem>> {
  return mutation(
    `${API_BASE_URL}/maintenance/landing/images/${encodeURIComponent(key)}`,
    { method: 'DELETE', headers: authHeaders(accessToken) },
    'item'
  );
}

export function createLandingReview(
  accessToken: string,
  payload: CreateLandingReviewPayload
): Promise<LandingApiResult<LandingReview>> {
  return mutation(
    `${API_BASE_URL}/maintenance/landing/reviews`,
    {
      method: 'POST',
      headers: jsonHeaders(accessToken),
      body: JSON.stringify(payload),
    },
    'review'
  );
}

export function updateLandingReview(
  reviewId: string,
  accessToken: string,
  payload: UpdateLandingReviewPayload
): Promise<LandingApiResult<LandingReview>> {
  return mutation(
    `${API_BASE_URL}/maintenance/landing/reviews/${reviewId}`,
    {
      method: 'PATCH',
      headers: jsonHeaders(accessToken),
      body: JSON.stringify(payload),
    },
    'review'
  );
}

export async function deleteLandingReview(
  reviewId: string,
  accessToken: string
): Promise<{ error: string | null }> {
  const response = await fetch(
    `${API_BASE_URL}/maintenance/landing/reviews/${reviewId}`,
    { method: 'DELETE', headers: authHeaders(accessToken) }
  );

  return { error: response.ok ? null : await parseError(response) };
}
