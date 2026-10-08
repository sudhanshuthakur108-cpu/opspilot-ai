import { AuthProvider } from './auth/AuthProvider.jsx';
import { useAuth } from './auth/authContext.js';
import { BrandMark } from './components/Brand.jsx';
import { AuthScreen } from './features/auth/AuthScreen.jsx';
import { SignedInScreen } from './features/auth/SignedInScreen.jsx';

function StartupScreen() {
  return (
    <div className="startup" role="status">
      <BrandMark />
      <span className="spinner" aria-hidden="true" />
      <span className="visually-hidden">Loading OpsPilot…</span>
    </div>
  );
}

function Screens() {
  const { status } = useAuth();

  if (status === 'loading') return <StartupScreen />;
  if (status === 'authenticated') return <SignedInScreen />;
  return <AuthScreen />;
}

export default function App() {
  return (
    <AuthProvider>
      <Screens />
    </AuthProvider>
  );
}
