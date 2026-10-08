import { AuthProvider } from './auth/AuthProvider.jsx';
import { useAuth } from './auth/authContext.js';
import { LoadingScreen } from './components/LoadingScreen.jsx';
import { AuthScreen } from './features/auth/AuthScreen.jsx';
import { Workspace } from './features/organizations/Workspace.jsx';

function Screens() {
  const { status } = useAuth();

  if (status === 'loading') return <LoadingScreen label="Loading OpsPilot…" />;
  if (status === 'authenticated') return <Workspace />;
  return <AuthScreen />;
}

export default function App() {
  return (
    <AuthProvider>
      <Screens />
    </AuthProvider>
  );
}
