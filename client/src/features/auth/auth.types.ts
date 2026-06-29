export interface AuthUser {
  id: string;
  email?: string;
  role?: string;
}

export interface Session {
  access_token: string;
  user: AuthUser;
}
