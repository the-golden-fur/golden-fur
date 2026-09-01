/**
 * A window event any flow can fire after it changes the signed-in
 * customer's credit (a cancellation that issues credit, a payment that
 * spends it) so CreditBalanceProvider re-pulls the balance without the
 * caller needing the context.
 */
export const CREDIT_BALANCE_CHANGED_EVENT = 'goldenfur:credit-balance-changed';

export function notifyCreditBalanceChanged() {
  window.dispatchEvent(new Event(CREDIT_BALANCE_CHANGED_EVENT));
}
