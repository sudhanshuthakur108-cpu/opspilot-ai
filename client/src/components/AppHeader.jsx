import { useState } from 'react';
import { useAuth } from '../auth/authContext.js';
import { Brand } from './Brand.jsx';
import './AppHeader.css';

// Top bar for signed-in screens: brand, the signed-in email and sign-out. A screen can put its
// own content (such as a page title) in place of the brand.
export function AppHeader({ children = <Brand />, className }) {
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
    <header className={className ? `app-header ${className}` : 'app-header'}>
      <div className="app-header__inner">
        {children}
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
      {error && (
        <p className="alert alert--error app-header__alert" role="alert">
          {error}
        </p>
      )}
    </header>
  );
}
