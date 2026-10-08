import { useEffect, useState } from 'react';
import { describeRequestError } from '../../api/errorMessages.js';
import { listOrganizations } from '../../api/organizations.js';
import { useAuth } from '../../auth/authContext.js';
import { AppHeader } from '../../components/AppHeader.jsx';
import { LoadingScreen } from '../../components/LoadingScreen.jsx';
import { SignedInScreen } from '../auth/SignedInScreen.jsx';
import { OnboardingScreen } from './OnboardingScreen.jsx';

function LoadFailed({ message, onRetry }) {
  return (
    <div className="app-shell">
      <AppHeader />
      <main className="app-main app-main--centered">
        <section className="panel load-failed" aria-labelledby="load-failed-title">
          <h1 id="load-failed-title" className="load-failed__title">
            We couldn’t load your workspaces
          </h1>
          <p className="lead">{message}</p>
          <button type="button" className="button button--primary" onClick={onRetry}>
            Try again
          </button>
        </section>
      </main>
    </div>
  );
}

// Everything behind sign-in starts here: load the user's organizations, then either onboard
// them (no organizations yet) or show the home screen.
export function Workspace() {
  const { endSession } = useAuth();
  const [organizations, setOrganizations] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [createdOrganizationId, setCreatedOrganizationId] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    listOrganizations()
      .then((list) => {
        if (active) setOrganizations(list);
      })
      .catch((error) => {
        if (!active) return;
        if (error.status === 401) {
          endSession();
        } else {
          setLoadError(describeRequestError(error));
        }
      });

    return () => {
      active = false;
    };
  }, [attempt, endSession]);

  function retry() {
    setLoadError('');
    setAttempt((count) => count + 1);
  }

  // The new organization comes back from the create request, so there is no need to reload the list.
  function handleCreated(organization) {
    setOrganizations([organization]);
    setCreatedOrganizationId(organization.id);
  }

  if (loadError) return <LoadFailed message={loadError} onRetry={retry} />;
  if (!organizations) return <LoadingScreen label="Loading your workspaces…" />;
  if (organizations.length === 0) return <OnboardingScreen onCreated={handleCreated} />;
  return <SignedInScreen organizations={organizations} createdOrganizationId={createdOrganizationId} />;
}
