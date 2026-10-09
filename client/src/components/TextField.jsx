import { useState } from 'react';
import './TextField.css';

// A labelled input with an optional hint and error message, wired up for screen readers.
// `trailing` renders inside the input frame (used by PasswordField for its toggle), and
// `multiline` makes it a <textarea>.
export function TextField({ id, label, hint, error, trailing, multiline = false, ref, ...inputProps }) {
  const Input = multiline ? 'textarea' : 'input';
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ');

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className={error ? 'field__control field__control--invalid' : 'field__control'}>
        <Input
          id={id}
          ref={ref}
          className={multiline ? 'field__input field__input--multiline' : 'field__input'}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          {...inputProps}
        />
        {trailing}
      </div>
      {hint && (
        <p id={hintId} className="field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="field__error">
          {error}
        </p>
      )}
    </div>
  );
}

// The same labelled control as TextField, for a <select>; `children` are its options.
export function SelectField({ id, label, hint, error, ref, children, ...selectProps }) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ');

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className={error ? 'field__control field__control--invalid' : 'field__control'}>
        <select
          id={id}
          ref={ref}
          className="field__input field__select"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          {...selectProps}
        >
          {children}
        </select>
      </div>
      {hint && (
        <p id={hintId} className="field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="field__error">
          {error}
        </p>
      )}
    </div>
  );
}

export function PasswordField({ id, ...props }) {
  const [visible, setVisible] = useState(false);

  const toggle = (
    <button
      type="button"
      className="field__toggle"
      aria-controls={id}
      aria-label={visible ? 'Hide password' : 'Show password'}
      onClick={() => setVisible((shown) => !shown)}
    >
      {visible ? 'Hide' : 'Show'}
    </button>
  );

  return <TextField id={id} type={visible ? 'text' : 'password'} trailing={toggle} {...props} />;
}
