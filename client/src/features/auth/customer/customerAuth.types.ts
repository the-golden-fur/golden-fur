export interface CustomerSignupPayload {
  full_name: string;
  account_email: string;
  password: string;
}

export interface CustomerLoginPayload {
  account_email: string;
  password: string;
}

export interface OAuthCallbackResult {
  provider: 'google' | 'facebook';
  merged: boolean;
  access_token: string;
  refresh_token: string;
}
