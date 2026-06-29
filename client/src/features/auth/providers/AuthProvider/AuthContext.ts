import { createContext } from 'react';
import type { AuthUser, Session } from '../../auth.types';

export interface AuthContextValue {
  session: Session | null;
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;
  refreshSession: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined
);
