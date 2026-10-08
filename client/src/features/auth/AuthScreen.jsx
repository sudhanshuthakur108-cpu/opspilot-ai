import { useEffect, useRef, useState } from 'react';
import { describeRequestError } from '../../api/errorMessages.js';
import { useAuth } from '../../auth/authContext.js';
import { Brand } from '../../components/Brand.jsx';
import { PasswordField, TextField } from '../../components/TextField.jsx';
import './AuthScreen.css';

// Mirrors the server's rules so obvious mistakes are caught before a request is made.
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

const COPY = {
  signIn: {
    title: 'Welcome back',
    lead: 'Sign in to your OpsPilot workspace.',
    submit: 'Sign in',
    submitting: 'Signing in…',
    passwordAutocomplete: 'current-password',
    switchPrompt: 'New to OpsPilot?',
    switchAction: 'Create an account',
  },
  signUp: {
    title: 'Create your account',
    lead: 'Get started with OpsPilot.',
    submit: 'Create account',
    submitting: 'Creating account…',
    passwordAutocomplete: 'new-password',
    switchPrompt: 'Already have an account?',
    switchAction: 'Sign in',
  },
};

function validate({ email, password }, mode) {
  const errors = {};

  if (!email.trim()) {
    errors.email = 'Enter your email address.';
  } else if (!EMAIL_FORMAT.test(email.trim())) {
    errors.email = 'Enter a valid email address, like name@company.com.';
  }

  if (!password) {
    errors.password = mode === 'signUp' ? 'Choose a password.' : 'Enter your password.';
  } else if (mode === 'signUp' && (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH)) {
    errors.password = `Use ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters.`;
  }

  return errors;
}

// Server errors are turned into fixed messages; a sign-in failure never says which of the
// email or password was wrong.
function describeError(error, mode) {
  if (error.status === 429) {
    return 'Too many attempts. Wait a few minutes, then try again.';
  }
  if (mode === 'signIn' && error.status === 401) {
    return 'Email or password is incorrect.';
  }
  if (mode === 'signUp' && error.status === 409) {
    return 'An account can’t be created with this email.';
  }
  if (error.status === 400) {
    return 'Check your details and try again.';
  }
  return describeRequestError(error);
}

export function AuthScreen() {
  const { signIn, signUp, sessionCheckFailed, sessionExpired } = useAuth();
  const [mode, setMode] = useState('signIn');
  const [values, setValues] = useState({ email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);

  const copy = COPY[mode];

  // After a failed attempt the password is cleared; put the cursor back there once the form
  // is interactive again.
  useEffect(() => {
    if (formError) passwordRef.current?.focus();
  }, [formError]);

  function updateField(event) {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: undefined }));
  }

  function switchMode() {
    setMode((current) => (current === 'signIn' ? 'signUp' : 'signIn'));
    setFieldErrors({});
    setFormError('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;

    const errors = validate(values, mode);
    setFieldErrors(errors);
    setFormError('');
    if (errors.email || errors.password) {
      (errors.email ? emailRef : passwordRef).current.focus();
      return;
    }

    setSubmitting(true);
    try {
      const credentials = { email: values.email.trim(), password: values.password };
      await (mode === 'signIn' ? signIn(credentials) : signUp(credentials));
    } catch (error) {
      setValues((current) => ({ ...current, password: '' }));
      setFormError(describeError(error, mode));
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <main className="auth-page__main">
        <div className="auth-page__brand">
          <Brand />
        </div>

        <section className="auth-card" aria-labelledby="auth-title">
          <header className="auth-card__header">
            <h1 id="auth-title" className="auth-card__title">
              {copy.title}
            </h1>
            <p className="auth-card__lead">{copy.lead}</p>
          </header>

          {sessionCheckFailed && !formError && (
            <p className="alert auth-card__alert">We couldn’t check whether you’re already signed in.</p>
          )}
          {sessionExpired && !formError && (
            <p className="alert auth-card__alert">Your session has ended. Sign in again to continue.</p>
          )}
          {formError && (
            <p className="alert alert--error auth-card__alert" role="alert">
              {formError}
            </p>
          )}

          <form className="auth-form" onSubmit={handleSubmit} noValidate aria-busy={submitting}>
            <fieldset className="auth-form__fields" disabled={submitting}>
              <TextField
                ref={emailRef}
                id="email"
                name="email"
                type="email"
                label="Email"
                autoComplete="email"
                inputMode="email"
                placeholder="name@company.com"
                value={values.email}
                onChange={updateField}
                error={fieldErrors.email}
              />
              <PasswordField
                ref={passwordRef}
                id="password"
                name="password"
                label="Password"
                autoComplete={copy.passwordAutocomplete}
                value={values.password}
                onChange={updateField}
                error={fieldErrors.password}
              />
              <button type="submit" className="button button--primary button--block">
                {submitting && <span className="spinner" aria-hidden="true" />}
                {submitting ? copy.submitting : copy.submit}
              </button>
            </fieldset>
          </form>

          <p className="auth-card__switch">
            {copy.switchPrompt}{' '}
            <button type="button" className="link-button" onClick={switchMode} disabled={submitting}>
              {copy.switchAction}
            </button>
          </p>
        </section>
      </main>

      <footer className="auth-page__footer">© {new Date().getFullYear()} OpsPilot AI</footer>
    </div>
  );
}
