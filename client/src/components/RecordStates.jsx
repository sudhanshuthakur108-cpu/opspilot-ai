import { Icon } from './Icon.jsx';

// Skeleton rows in the shape of a table while a list loads. `label` is announced to screen readers.
export function LoadingRows({ label, rows = 4 }) {
  return (
    <div className="records-skeleton">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="records-skeleton__row" aria-hidden="true">
          <span className="skeleton" style={{ width: `${85 - row * 9}%` }} />
          <span className="skeleton" style={{ width: '70%' }} />
          <span className="skeleton" style={{ width: '55%' }} />
          <span className="skeleton" style={{ width: '60%' }} />
        </div>
      ))}
      <span role="status" className="visually-hidden">
        {label}
      </span>
    </div>
  );
}

export function LoadFailure({ title, message, onRetry }) {
  return (
    <div className="records__state" role="alert">
      <span className="records__state-icon" aria-hidden="true">
        <Icon name="alert" />
      </span>
      <p className="records__state-title">{title}</p>
      <p className="records__state-text">{message}</p>
      <button type="button" className="button button--secondary button--small" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

// A search box that narrows the list already on screen.
export function ListFilter({ id, label, value, onChange, placeholder }) {
  return (
    <div className="records__filter">
      <Icon name="search" size={16} />
      <label className="visually-hidden" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="search"
        placeholder={placeholder}
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

// Case-insensitive match of `query` against any of the given text fields.
export function matchesQuery(query, ...fields) {
  const needle = query.trim().toLowerCase();
  return !needle || fields.some((field) => field?.toLowerCase().includes(needle));
}
