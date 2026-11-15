/**
 * Bump whenever STORE_POLICIES (StorePoliciesModal.tsx) changes in a way
 * customers must re-agree to. A customer whose
 * customer_profiles.store_policies_agreed_version is lower than this is
 * asked once more on their next booking.
 */
export const STORE_POLICIES_VERSION = 1;

/** How long "Remember policies" lasts before the customer is asked
 * again. */
export const STORE_POLICIES_REMEMBER_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether a saved agreement (customer_profiles.store_policies_agreed_*)
 * still lets the customer skip the popup: it must be for the current
 * STORE_POLICIES_VERSION and less than STORE_POLICIES_REMEMBER_DAYS old.
 */
export function isStorePoliciesAgreementCurrent(
  agreedVersion: number | null | undefined,
  agreedAt: string | null | undefined,
  now: Date = new Date()
): boolean {
  if ((agreedVersion ?? 0) < STORE_POLICIES_VERSION || !agreedAt) return false;

  const agreedTime = new Date(agreedAt).getTime();
  if (Number.isNaN(agreedTime)) return false;

  return now.getTime() - agreedTime < STORE_POLICIES_REMEMBER_DAYS * DAY_MS;
}
