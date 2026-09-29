export type MfaMethod = 'authenticator' | 'email';

export interface TotpEnrollResponse {
  id?: string;
  type?: string;
  totp?: {
    qr_code?: string;
    secret?: string;
    uri?: string;
  };
  qr_code?: string;
  uri?: string;
  /** 'email' method only - the first code was sent, there's nothing to
   * display (no QR/secret exists for the user to see). */
  sent?: boolean;
}

export interface TotpChallengePayload {
  code: string;
  method?: MfaMethod;
  /** "Remember this device for 30 days" - only actually honored server-side
   * for accounts where MFA is voluntary (see mfaVerifyController); safe to
   * always send when the user checked the box regardless of role. */
  remember_device?: boolean;
}

export interface MfaMethodStatus {
  authenticator: boolean;
  email: boolean;
}

export interface MfaStatusResponse {
  role?: string | null;
  /** True whenever at least one method is enrolled - kept for every caller
   * that only needs a yes/no (e.g. the login redirect decision). */
  mfa_enrolled: boolean;
  methods: MfaMethodStatus;
  preferred_method: MfaMethod;
}

export interface MfaSessionResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  success?: boolean;
  /** Only present when remember_device was set and the server actually
   * honored it (see TotpChallengePayload's comment) - persist it and send
   * it back on the next login. */
  device_token?: string;
}

export interface MfaUnenrollResponse {
  removed: boolean;
}
