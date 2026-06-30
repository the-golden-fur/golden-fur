export interface StaffLoginPayload {
  username: string;
  password: string;
}

export interface StaffLoginResponse {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  requires_mfa?: boolean;
  mfa_enrolled?: boolean;
  role?: string;
}

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
}

export interface TotpChallengePayload {
  code: string;
}

export interface StaffForgotPasswordPayload {
  email: string;
}

export interface StaffAuthMessageResponse {
  message?: string;
  success?: boolean;
}

