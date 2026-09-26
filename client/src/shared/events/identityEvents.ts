/**
 * A window event any flow can fire after it changes the signed-in user's
 * identity display (avatar, display name) so StaffAuthGuard/
 * CustomerAuthGuard re-pull their profile and the navbar's identity chip
 * updates without a full reload - same idiom as creditBalanceEvents.ts's
 * CREDIT_BALANCE_CHANGED_EVENT.
 */
export const IDENTITY_CHANGED_EVENT = 'goldenfur:identity-changed';

export function notifyIdentityChanged() {
  window.dispatchEvent(new Event(IDENTITY_CHANGED_EVENT));
}
