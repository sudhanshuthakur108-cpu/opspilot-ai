import { useEffect, useRef, useState } from 'react';
import { describeRequestError } from '../../api/errorMessages.js';
import { useAuth } from '../../auth/authContext.js';
import { TextField } from '../../components/TextField.jsx';

// Mirrors the server's rules so obvious mistakes are caught before a request is made.
const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 80;

// The server trims the name and joins runs of whitespace, so compare it the same way.
const normalize = (name) => name.trim().replace(/\s+/g, ' ');

function validateName(name) {
  const trimmed = normalize(name);
  if (!trimmed) return 'Enter your name.';
  if (trimmed.length < NAME_MIN_LENGTH || trimmed.length > NAME_MAX_LENGTH || !/\p{L}/u.test(trimmed)) {
    return `Use ${NAME_MIN_LENGTH} to ${NAME_MAX_LENGTH} characters, including at least one letter.`;
  }
  return '';
}

// The signed-in person's own details. Unlike the workspace settings, anyone can change their own.
export function ProfileSection() {
  const { user, updateProfile, endSession } = useAuth();
  const [name, setName] = useState(user.name ?? '');
  const [nameError, setNameError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const nameRef = useRef(null);
  const unchanged = normalize(name) === (user.name ?? '');

  // Runs once the form is enabled again, so focus can land on the field.
  useEffect(() => {
    if (nameError) nameRef.current.focus();
  }, [nameError]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (saving) return;

    const error = validateName(name);
    setNameError(error);
    setSaveError('');
    setSaved(false);
    if (error) return;

    setSaving(true);
    try {
      const updated = await updateProfile({ name: normalize(name) });
      setName(updated.name);
      setSaved(true);
    } catch (failure) {
      if (failure.status === 401) {
        endSession();
        return;
      }
      if (failure.status === 400) {
        setNameError(`Use ${NAME_MIN_LENGTH} to ${NAME_MAX_LENGTH} characters, including at least one letter.`);
      } else {
        setSaveError(`We couldn’t save your profile. ${describeRequestError(failure)}`);
      }
    }
    setSaving(false);
  }

  return (
    <form
      className="records__panel settings-form settings-section"
      onSubmit={handleSubmit}
      noValidate
      aria-labelledby="settings-profile-title"
      aria-busy={saving}
    >
      <div className="settings-section__intro">
        <h2 id="settings-profile-title" className="records__panel-title">
          Your profile
        </h2>
        <p className="settings-section__text">How you appear in OpsPilot. Only you can change it.</p>
      </div>

      <div className="settings-section__body">
        {!user.name && (
          <p className="alert alert--info">Add your name so OpsPilot can greet you by it and your teammates know who you are.</p>
        )}
        <div role="status" className="records__notice">
          {saved && <p className="alert alert--success">Profile saved.</p>}
        </div>
        {saveError && (
          <p className="alert alert--error" role="alert">
            {saveError}
          </p>
        )}

        <fieldset className="settings-form__fields" disabled={saving} aria-labelledby="settings-profile-title">
          <TextField
            ref={nameRef}
            id="profile-name"
            name="name"
            label="Full name"
            hint={`Up to ${NAME_MAX_LENGTH} characters.`}
            autoComplete="name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setNameError('');
              setSaved(false);
            }}
            error={nameError}
          />
          <TextField
            id="profile-email"
            name="email"
            type="email"
            label="Email address"
            hint="Used to sign in. It can’t be changed here."
            readOnly
            value={user.email}
          />
          <div className="settings-form__actions">
            <button type="submit" className="button button--primary" disabled={unchanged && !saving}>
              {saving && <span className="spinner" aria-hidden="true" />}
              {saving ? 'Saving profile…' : 'Save profile'}
            </button>
          </div>
        </fieldset>
      </div>
    </form>
  );
}
