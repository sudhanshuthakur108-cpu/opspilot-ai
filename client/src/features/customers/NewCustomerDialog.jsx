import { useEffect, useRef, useState } from 'react';
import { createCustomer } from '../../api/customers.js';
import { describeRequestError } from '../../api/errorMessages.js';
import { useAuth } from '../../auth/authContext.js';
import { Icon } from '../../components/Icon.jsx';
import { TextField } from '../../components/TextField.jsx';
import './NewCustomerDialog.css';

// Mirrors the server's rules so obvious mistakes are caught before a request is made.
const NAME_MAX_LENGTH = 120;
const EMAIL_MAX_LENGTH = 254;
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_MAX_LENGTH = 40;

function validate({ name, email, phone }) {
  const errors = {};

  if (!name.trim()) {
    errors.name = 'Enter the customer’s name.';
  } else if (name.trim().length > NAME_MAX_LENGTH) {
    errors.name = `Use ${NAME_MAX_LENGTH} characters or fewer.`;
  }

  const trimmedEmail = email.trim();
  if (trimmedEmail && (trimmedEmail.length > EMAIL_MAX_LENGTH || !EMAIL_FORMAT.test(trimmedEmail))) {
    errors.email = 'Enter a valid email address, like name@company.com.';
  }

  if (phone.trim().length > PHONE_MAX_LENGTH) {
    errors.phone = `Use ${PHONE_MAX_LENGTH} characters or fewer.`;
  }

  return errors;
}

function optionalLabel(text) {
  return (
    <>
      {text} <span className="dialog__optional">Optional</span>
    </>
  );
}

// A modal form for one new customer, rendered only while open. It always closes through the
// <dialog> element, so the browser returns focus to the button that opened it.
export function NewCustomerDialog({ organizationId, onCreated, onClose }) {
  const { endSession } = useAuth();
  const [values, setValues] = useState({ name: '', email: '', phone: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef(null);
  const nameRef = useRef(null);
  const emailRef = useRef(null);
  const phoneRef = useRef(null);

  useEffect(() => {
    if (!dialogRef.current.open) dialogRef.current.showModal();
    nameRef.current.focus();
  }, []);

  // Runs once the form is enabled again after a failed request.
  useEffect(() => {
    if (formError) nameRef.current.focus();
  }, [formError]);

  function close() {
    dialogRef.current.close();
  }

  function updateField(event) {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: undefined }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (saving) return;

    const errors = validate(values);
    setFieldErrors(errors);
    setFormError('');
    const firstInvalid = [
      [errors.name, nameRef],
      [errors.email, emailRef],
      [errors.phone, phoneRef],
    ].find(([error]) => error);
    if (firstInvalid) {
      firstInvalid[1].current.focus();
      return;
    }

    setSaving(true);
    try {
      const customer = await createCustomer(organizationId, {
        name: values.name.trim(),
        email: values.email.trim() || undefined,
        phone: values.phone.trim() || undefined,
      });
      onCreated(customer);
      close();
    } catch (error) {
      if (error.status === 401) {
        endSession();
        return;
      }
      setFormError(error.status === 400 ? 'Check the customer’s details and try again.' : describeRequestError(error));
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      aria-labelledby="new-customer-title"
      onCancel={(event) => saving && event.preventDefault()}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} noValidate aria-busy={saving}>
        <div className="dialog__header">
          <div>
            <h2 id="new-customer-title" className="dialog__title">
              Add customer
            </h2>
            <p className="dialog__lead">Only the name is required.</p>
          </div>
          <button type="button" className="icon-button" aria-label="Close" onClick={close} disabled={saving}>
            <Icon name="close" />
          </button>
        </div>

        {formError && (
          <p className="alert alert--error dialog__alert" role="alert">
            {formError}
          </p>
        )}

        <fieldset className="dialog__fields" disabled={saving}>
          <TextField
            ref={nameRef}
            id="customer-name"
            name="name"
            label="Name"
            placeholder="Initech Ltd."
            autoComplete="off"
            value={values.name}
            onChange={updateField}
            error={fieldErrors.name}
          />
          <TextField
            ref={emailRef}
            id="customer-email"
            name="email"
            type="email"
            inputMode="email"
            label={optionalLabel('Email')}
            placeholder="name@company.com"
            autoComplete="off"
            value={values.email}
            onChange={updateField}
            error={fieldErrors.email}
          />
          <TextField
            ref={phoneRef}
            id="customer-phone"
            name="phone"
            type="tel"
            label={optionalLabel('Phone')}
            autoComplete="off"
            value={values.phone}
            onChange={updateField}
            error={fieldErrors.phone}
          />
        </fieldset>

        <div className="dialog__actions">
          <button type="button" className="button button--secondary" onClick={close} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="button button--primary" disabled={saving}>
            {saving && <span className="spinner" aria-hidden="true" />}
            {saving ? 'Adding…' : 'Add customer'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
