/**
 * Staff roles that must have MFA enrolled - mirrors the server's
 * MANDATORY_MFA_ROLES (server/src/shared/auth/mandatoryMfaRoles.ts). Single
 * shared source client-side too: StaffLoginForm's post-login redirect and
 * SecurityTab's enrollment messaging/unbind-guard used to each define their
 * own copy of this list, and one of them drifted (missing 'Supervisor'),
 * silently letting a Supervisor skip the mandatory-enroll flow.
 */
export const MANDATORY_MFA_ROLES = new Set([
  'Admin',
  'Supervisor',
  'Superadmin',
]);
