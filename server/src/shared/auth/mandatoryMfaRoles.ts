/**
 * Staff roles that must complete MFA (reach aal2) before touching MFA-gated
 * routes - the single source of truth requireMfa.middleware.ts,
 * staffAuth.controller.ts's unenroll guard, and its "remember this device"
 * eligibility check all read from, so they can't drift out of sync with each
 * other the way requireMfa.middleware.ts and SecurityTab.tsx previously did
 * (the client was missing 'Supervisor').
 */
export const MANDATORY_MFA_ROLES = new Set([
  'Admin',
  'Supervisor',
  'Superadmin',
]);
