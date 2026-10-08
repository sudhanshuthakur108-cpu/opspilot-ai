import { useState } from 'react';
import './TextField.css';

// A labelled input with an optional error message, wired up for screen readers.
// `trailing` renders inside the input frame (used by PasswordField for its toggle).
export function TextField({ id, label, error, trailing, ref, ...inputProps }) {
  const errorId = `${id}-error`;

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className={error ? 'field__control field__control--invalid' : 'field__control'}>
        <input
          id={id}
          ref={ref}
          className="field__input"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          {...inputProps}
        />
        {trailing}
      </div>
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
