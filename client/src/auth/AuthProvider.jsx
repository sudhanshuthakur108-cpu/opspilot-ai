import { useCallback, useEffect, useMemo, useState } from 'react';
import { getCurrentUser, login, logout, register } from '../api/auth.js';
import { AuthContext } from './authContext.js';

const SIGNED_OUT = { status: 'unauthenticated', user: null, sessionCheckFailed: false, sessionExpired: false };

// Holds who is signed in: status is 'loading' until the first /auth/me answer, then
// 'authenticated' (with `user`) or 'unauthenticated'. Only the user's public fields are kept;
// the session itself stays in the HttpOnly cookie.
export function AuthProvider({ children }) {
  const [session, setSession] = useState({ ...SIGNED_OUT, status: 'loading' });

  useEffect(() => {
    let active = true;

    getCurrentUser()
      .then((user) => {
        if (active) setSession(user ? { ...SIGNED_OUT, status: 'authenticated', user } : SIGNED_OUT);
      })
      .catch(() => {
        if (active) setSession({ ...SIGNED_OUT, sessionCheckFailed: true });
      });

    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(async (credentials) => {
    const user = await login(credentials);
    setSession({ ...SIGNED_OUT, status: 'authenticated', user });
  }, []);

  const signUp = useCallback(async (credentials) => {
    const user = await register(credentials);
    setSession({ ...SIGNED_OUT, status: 'authenticated', user });
  }, []);

  // For when the server answers 401 to a signed-in request: the session is already gone there,
  // so there is nothing to call; just return to sign-in and say why.
  const endSession = useCallback(() => {
    setSession({ ...SIGNED_OUT, sessionExpired: true });
  }, []);

  // Only forgets the user once the server confirms, so a failed request never leaves a live
  // session behind a signed-out screen.
  const signOut = useCallback(async () => {
    await logout();
    setSession(SIGNED_OUT);
  }, []);

  const value = useMemo(
    () => ({ ...session, signIn, signUp, signOut, endSession }),
    [session, signIn, signUp, signOut, endSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
