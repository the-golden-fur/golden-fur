export interface StaffLoginPayload {
  identifier: string;
  password: string;
  /** A stored "remember this device" token from a prior login - see
   * trustedDevice.api.ts. Sent unconditionally when one exists; the server
   * decides whether to actually honor it. */
  device_token?: string;
}

export interface StaffLoginResponse {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  requires_mfa?: boolean;
  mfa_enrolled?: boolean;
  role?: string;
  /** True when a valid trusted-device token was presented and honored - the
   * caller should skip the MFA challenge redirect entirely. */
  mfa_bypassed?: boolean;
}

export interface StaffForgotPasswordPayload {
  email: string;
}

export interface StaffAuthMessageResponse {
  message?: string;
  success?: boolean;
}
