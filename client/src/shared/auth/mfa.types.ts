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

export interface MfaStatusResponse {
  role?: string | null;
  mfa_enrolled: boolean;
}

export interface MfaSessionResponse {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
}

export interface MfaUnenrollResponse {
  removed: string[];
  failed: { factorId: string; message: string }[];
}
