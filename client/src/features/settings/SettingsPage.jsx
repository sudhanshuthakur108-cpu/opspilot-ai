import { useEffect, useRef, useState } from 'react';
import { describeRequestError } from '../../api/errorMessages.js';
import { updateOrganization } from '../../api/organizations.js';
import { useAuth } from '../../auth/authContext.js';
import { TextField } from '../../components/TextField.jsx';
import { canManageWorkspace, roleLabel } from '../organizations/roles.js';
import '../../styles/records.css';
import './Settings.css';

// The server's limit for organization names.
const NAME_MAX_LENGTH = 100;

const ROLE_DESCRIPTIONS = {
  owner: 'You can change workspace settings and view the audit log.',
  admin: 'You can change workspace settings and view the audit log.',
  member: 'You can work with customers, orders and tasks. Owners and admins manage workspace settings.',
};

const createdFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'long' });

function validateName(name) {
  const trimmed = name.trim();
  if (!trimmed) return 'Enter an organization name.';
  if (trimmed.length > NAME_MAX_LENGTH) return `Use ${NAME_MAX_LENGTH} characters or fewer.`;
  return '';
}

function describeSaveError(error) {
  if (error.status === 403) return 'You don’t have permission to change workspace settings.';
  if (error.status === 400) return 'This name can’t be used. Check it and try again.';
  return describeRequestError(error);
}

// `onUpdated` receives the organization once the server has saved a change.
export function SettingsPage({ organization, onUpdated }) {
  const { user, endSession } = useAuth();
  const [name, setName] = useState(organization.name);
  const [nameError, setNameError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState('');
  const [saving, setSaving] = useState(false);
  const nameRef = useRef(null);
  const canEdit = canManageWorkspace(organization.role);
  const unchanged = name.trim() === organization.name;

  // Runs once the form is enabled again, so focus can land on the field.
  useEffect(() => {
    if (nameError) nameRef.current.focus();
  }, [nameError]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (saving || !canEdit) return;

    const error = validateName(name);
    setNameError(error);
    setSaveError('');
    setSaved('');
    if (error) return;

    setSaving(true);
    try {
      const updated = await updateOrganization(organization.id, { name: name.trim() });
      setName(updated.name);
      setSaved(updated.name);
      onUpdated(updated);
    } catch (failure) {
      if (failure.status === 401) {
        endSession();
        return;
      }
      setSaveError(describeSaveError(failure));
    }
    setSaving(false);
  }

  return (
    <div className="records">
      <div className="records__header">
        <p className="records__intro">
          Settings for <strong>{organization.name}</strong>.
        </p>
      </div>

      <form className="records__panel settings-form" onSubmit={handleSubmit} noValidate aria-busy={saving}>
        <h2 id="settings-details-title" className="records__panel-title">
          Workspace details
        </h2>

        <div role="status" className="records__notice">
          {saved && (
            <p className="alert alert--success">
              Settings saved. The workspace is now called <strong>{saved}</strong>.
            </p>
          )}
        </div>
        {saveError && (
          <p className="alert alert--error" role="alert">
            {saveError}
          </p>
        )}

        <fieldset className="settings-form__fields" disabled={saving} aria-labelledby="settings-details-title">
          <TextField
            ref={nameRef}
            id="settings-name"
            name="name"
            label="Organization name"
            hint={canEdit ? `Shown to everyone in this workspace. Up to ${NAME_MAX_LENGTH} characters.` : undefined}
            autoComplete="organization"
            readOnly={!canEdit}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setNameError('');
              setSaved('');
            }}
            error={nameError}
          />
          <TextField
            id="settings-slug"
            name="slug"
            label="Workspace address"
            hint="The address is set when the workspace is created and can’t be changed."
            readOnly
            value={organization.slug}
          />

          {canEdit ? (
            <div className="settings-form__actions">
              <button type="submit" className="button button--primary" disabled={unchanged && !saving}>
                {saving && <span className="spinner" aria-hidden="true" />}
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          ) : (
            <p className="alert">Only owners and admins can change workspace settings.</p>
          )}
        </fieldset>
      </form>

      <section className="records__panel" aria-labelledby="settings-about-title">
        <h2 id="settings-about-title" className="records__panel-title">
          About this workspace
        </h2>
        <dl className="settings-details">
          <div>
            <dt>Your role</dt>
            <dd>
              <span className="settings-details__value">{roleLabel(organization.role)}</span>
              {ROLE_DESCRIPTIONS[organization.role] && (
                <span className="settings-details__note">{ROLE_DESCRIPTIONS[organization.role]}</span>
              )}
            </dd>
          </div>
          <div>
            <dt>Signed in as</dt>
            <dd>
              <span className="settings-details__value">{user.email}</span>
            </dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>
              <time className="settings-details__value" dateTime={organization.createdAt}>
                {createdFormat.format(new Date(organization.createdAt))}
              </time>
            </dd>
          </div>
          <div>
            <dt>AI Assistant</dt>
            <dd>
              <span className="settings-details__value">Read-only</span>
              <span className="settings-details__note">It can read customers, orders and tasks, but can’t change them.</span>
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
