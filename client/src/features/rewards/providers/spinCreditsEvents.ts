/**
 * A window event any flow can fire after it changes the signed-in
 * customer's spins (a spin on My Rewards or in the pop-up) so
 * SpinCreditsProvider re-pulls the count without the caller needing the
 * context - same pattern as creditBalanceEvents.ts.
 */
export const SPIN_CREDITS_CHANGED_EVENT = 'goldenfur:spin-credits-changed';

export function notifySpinCreditsChanged() {
  window.dispatchEvent(new Event(SPIN_CREDITS_CHANGED_EVENT));
}
