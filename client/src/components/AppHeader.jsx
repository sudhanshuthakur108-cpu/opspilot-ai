import { useState } from 'react';
import { displayName, initial } from '../auth/displayName.js';
import { useAuth } from '../auth/authContext.js';
import { Brand } from './Brand.jsx';
import { Icon } from './Icon.jsx';
import { ThemeToggle } from './ThemeToggle.jsx';
import './AppHeader.css';

// Top bar for signed-in screens: page context (the brand by default), the theme toggle, who is
// signed in and sign-out.
export function AppHeader({ children = <Brand />, className }) {
  const { user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState('');
  const name = displayName(user);

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
        <div className="app-header__actions">
          <ThemeToggle />
          <div className="app-header__account">
            <span className="app-header__avatar" aria-hidden="true">
              {initial(user)}
            </span>
            <span className="app-header__identity">
              {name && <span className="app-header__name">{name}</span>}
              <span className="app-header__email">{user.email}</span>
            </span>
          </div>
          <button type="button" className="button button--ghost button--small app-header__sign-out" onClick={handleSignOut} disabled={signingOut}>
            {signingOut ? <span className="spinner" aria-hidden="true" /> : <Icon name="logout" size={18} />}
            <span className="app-header__sign-out-label">{signingOut ? 'Signing out…' : 'Sign out'}</span>
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
