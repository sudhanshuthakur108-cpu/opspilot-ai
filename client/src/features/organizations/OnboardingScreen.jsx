import { useEffect, useRef, useState } from 'react';
import { describeRequestError } from '../../api/errorMessages.js';
import { createOrganization } from '../../api/organizations.js';
import { useAuth } from '../../auth/authContext.js';
import { AppHeader } from '../../components/AppHeader.jsx';
import { TextField } from '../../components/TextField.jsx';
import { toSlug } from './slug.js';
import './OnboardingScreen.css';

// The server's limit for organization names.
const NAME_MAX_LENGTH = 100;

function validateName(name) {
  const trimmed = name.trim();
  if (!trimmed) {
    return 'Enter an organization name.';
  }
  if (trimmed.length > NAME_MAX_LENGTH) {
    return `Use ${NAME_MAX_LENGTH} characters or fewer.`;
  }
  if (!toSlug(trimmed)) {
    return 'Include at least one letter or number in the name.';
  }
  return '';
}

// Shown to a signed-in user who belongs to no organization yet.
export function OnboardingScreen({ onCreated }) {
  const { endSession } = useAuth();
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [formError, setFormError] = useState('');
  const [creating, setCreating] = useState(false);
  const nameRef = useRef(null);

  const slug = toSlug(name);

  // Runs after the form is enabled again, so focus can land on the field.
  useEffect(() => {
    if (nameError) nameRef.current?.focus();
  }, [nameError]);

  function updateName(event) {
    setName(event.target.value);
    setNameError('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (creating) return;

    const error = validateName(name);
    setNameError(error);
    setFormError('');
    if (error) return;

    setCreating(true);
    try {
      onCreated(await createOrganization({ name: name.trim(), slug }));
    } catch (requestError) {
      if (requestError.status === 401) {
        endSession();
        return;
      }

      if (requestError.status === 409) {
        setNameError('This workspace name is already in use. Try a different name.');
      } else if (requestError.status === 400) {
        setNameError('This name can’t be used for a workspace. Try a different name.');
      } else {
        setFormError(describeRequestError(requestError));
      }
      setCreating(false);
    }
  }

  return (
    <div className="app-shell">
      <AppHeader />

      <main className="app-main app-main--centered">
        <section className="panel onboarding" aria-labelledby="onboarding-title">
          <div className="onboarding__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" focusable="false">
              <path
                d="M4 20V8.5L12 4l8 4.5V20M9 20v-5.5h6V20M3 20h18"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <p className="eyebrow">Welcome to OpsPilot</p>
          <h1 id="onboarding-title" className="page-title">
            Create your workspace
          </h1>
          <p className="lead onboarding__lead">Set up your organization to start managing operations.</p>

          {formError && (
            <p className="alert alert--error onboarding__alert" role="alert">
              {formError}
            </p>
          )}

          <form onSubmit={handleSubmit} noValidate aria-busy={creating}>
            <fieldset className="onboarding__fields" disabled={creating}>
              <TextField
                ref={nameRef}
                id="organization-name"
                name="name"
                label="Organization name"
                placeholder="Acme Logistics"
                autoComplete="organization"
                value={name}
                onChange={updateName}
                hint={slug ? `Workspace address: ${slug}` : 'Your workspace address is created from the name.'}
                error={nameError}
              />
              <button type="submit" className="button button--primary button--block">
                {creating && <span className="spinner" aria-hidden="true" />}
                {creating ? 'Creating organization…' : 'Create organization'}
              </button>
            </fieldset>
          </form>

          <p className="onboarding__footnote">You’ll be the owner of this workspace.</p>
        </section>
      </main>
    </div>
  );
}
