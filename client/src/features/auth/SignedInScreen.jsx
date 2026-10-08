import { useState } from 'react';
import { useAuth } from '../../auth/authContext.js';
import { Brand } from '../../components/Brand.jsx';
import './SignedInScreen.css';

// Temporary landing screen for signed-in users until the dashboard exists.
export function SignedInScreen() {
  const { user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState('');

  async function handleSignOut() {
    setSigningOut(true);
    setError('');
    try {
      await signOut();
    } catch {
      setError('We couldn’t sign you out. Please try again.');
      setSigningOut(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__inner">
          <Brand />
          <div className="app-header__account">
            <span className="app-header__email">{user.email}</span>
            <button
              type="button"
              className="button button--secondary button--small"
              onClick={handleSignOut}
              disabled={signingOut}
            >
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      </header>

      <main className="signed-in">
        <section className="signed-in__card" aria-labelledby="signed-in-title">
          <div className="signed-in__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="24" height="24" focusable="false">
              <path
                d="m5 12.5 4.5 4.5L19 7.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1 id="signed-in-title" className="signed-in__title">
            You’re signed in
          </h1>
          <p className="signed-in__account">
            Signed in as <strong>{user.email}</strong>
          </p>
          <p className="signed-in__note">Your dashboard will appear here in an upcoming release.</p>

          {error && (
            <p className="alert alert--error signed-in__alert" role="alert">
              {error}
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
