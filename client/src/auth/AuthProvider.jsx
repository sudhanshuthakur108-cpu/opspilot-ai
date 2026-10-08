import { useCallback, useEffect, useMemo, useState } from 'react';
import { getCurrentUser, login, logout, register } from '../api/auth.js';
import { AuthContext } from './authContext.js';

const SIGNED_OUT = { status: 'unauthenticated', user: null, sessionCheckFailed: false };

// Holds who is signed in: status is 'loading' until the first /auth/me answer, then
// 'authenticated' (with `user`) or 'unauthenticated'. Only the user's public fields are kept;
// the session itself stays in the HttpOnly cookie.
export function AuthProvider({ children }) {
  const [session, setSession] = useState({ status: 'loading', user: null, sessionCheckFailed: false });

  useEffect(() => {
    let active = true;

    getCurrentUser()
      .then((user) => {
        if (active) setSession(user ? { status: 'authenticated', user, sessionCheckFailed: false } : SIGNED_OUT);
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
    setSession({ status: 'authenticated', user, sessionCheckFailed: false });
  }, []);

  const signUp = useCallback(async (credentials) => {
    const user = await register(credentials);
    setSession({ status: 'authenticated', user, sessionCheckFailed: false });
  }, []);

  // Only forgets the user once the server confirms, so a failed request never leaves a live
  // session behind a signed-out screen.
  const signOut = useCallback(async () => {
    await logout();
    setSession(SIGNED_OUT);
  }, []);

  const value = useMemo(() => ({ ...session, signIn, signUp, signOut }), [session, signIn, signUp, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
