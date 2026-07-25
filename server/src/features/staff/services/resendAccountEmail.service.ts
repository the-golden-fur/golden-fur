import { supabase } from '../../../config/supabase/supabase.config.ts';
import { decryptTempCredential } from '../../../shared/crypto/tempCredential.ts';
import { sendAccountCreatedEmail } from '../../../shared/email/accountCreatedEmail.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

interface ResendAccountEmailParams {
  targetStaffId: string;
}

/**
 * Issue #74: re-sends the existing account_created credential email as-is -
 * does NOT generate a new temporary password (AC-2/AC-4). Reuses the same
 * Resend-backed template as the original send (staffManagement.service.ts),
 * decrypting the password stored at creation time rather than calling
 * Supabase Auth to issue a new one.
 *
 * Once a staff member has logged in for the first time, staffAuth.controller
 * clears temp_credential_ciphertext/-_iv - at that point the original
 * temporary password is gone by design (it's presumably already been
 * changed), so a resend request 409s rather than silently emailing a stale,
 * no-longer-valid password.
 */
export async function resendAccountEmail({
  targetStaffId,
}: ResendAccountEmailParams): Promise<void> {
  const { data: staff, error } = await supabase
    .from('staff_profiles')
    .select(
      'username, registered_email, temp_credential_ciphertext, temp_credential_iv'
    )
    .eq('id', targetStaffId)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!staff) throwWithStatus(404, 'Staff profile not found');

  if (!staff.temp_credential_ciphertext || !staff.temp_credential_iv) {
    throwWithStatus(
      409,
      'No pending temporary credential to resend - this staff member has already logged in, or the account predates this feature'
    );
  }

  const temporaryPassword = decryptTempCredential({
    ciphertext: staff.temp_credential_ciphertext,
    iv: staff.temp_credential_iv,
  });

  await sendAccountCreatedEmail({
    to: staff.registered_email,
    username: staff.username,
    temporaryPassword,
    isResend: true,
  });
}
