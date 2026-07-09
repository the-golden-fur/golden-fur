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
  // Only known when sessionStorage's OAuth marker survived the redirect
  // chain back from the provider; the session is established from the
  // callback's URL tokens either way, so this is informational only.
  provider: 'google' | 'facebook' | null;
  merged: boolean;
  access_token: string;
  refresh_token: string;
}
