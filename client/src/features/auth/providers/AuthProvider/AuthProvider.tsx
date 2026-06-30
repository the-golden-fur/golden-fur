import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  getSession,
  onAuthStateChange,
  refreshSession as refreshAuthSession,
  setSession as setAuthSession,
  signOut as signOutAuth,
} from '../../api/auth.api';
import type { Session } from '../../auth.types';
import { AuthContext, type AuthContextValue } from './AuthContext';

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const user = session?.user ?? null;
  const accessToken = session?.access_token ?? null;

  const refreshSession = useCallback(async () => {
    setIsLoading(true);
    const response = await refreshAuthSession();
    setSession((response.data?.session as Session | null) ?? null);
    setIsLoading(false);
  }, []);

  const signOut = useCallback(async () => {
    setIsLoading(true);
    const result = await signOutAuth();
    if (!result.error) {
      setSession(null);
    }
    setIsLoading(false);
  }, []);

  const applySession = useCallback(
    async (accessTokenValue: string, refreshTokenValue: string) => {
      setIsLoading(true);
      const response = await setAuthSession(accessTokenValue, refreshTokenValue);
      setSession((response.data?.session as Session | null) ?? null);
      setIsLoading(false);
    },
    []
  );

  useEffect(() => {
    let isMounted = true;

    const initializeSession = async () => {
      const response = await getSession();
      if (!isMounted) {
        return;
      }

      setSession((response.data?.session as Session | null) ?? null);
      setIsLoading(false);
    };

    void initializeSession();

    const subscription = onAuthStateChange((_event, nextSession) => {
      if (!isMounted) {
        return;
      }

      setSession((nextSession as Session | null) ?? null);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      subscription?.data?.subscription?.unsubscribe?.();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      accessToken,
      isLoading,
      refreshSession,
      applySession,
      signOut,
    }),
    [accessToken, applySession, isLoading, refreshSession, session, signOut, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
