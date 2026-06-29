export type StaffRole = 'admin' | 'supervisor' | 'staff';

export interface StaffSession {
  accessToken: string;
  user: {
    id: string;
    email?: string;
    role?: StaffRole;
  };
  mfaRequired?: boolean;
}

export interface StaffAuthState {
  session: StaffSession | null;
  isAuthenticated: boolean;
  isMfaPending: boolean;
  isLoading: boolean;
}
