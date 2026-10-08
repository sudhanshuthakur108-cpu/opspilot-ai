import './Brand.css';

export function BrandMark() {
  return (
    <svg className="brand__mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="8" fill="var(--color-primary)" />
      <path
        d="M8.5 21.5 13.5 15.5l4 3 6-8"
        fill="none"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="23.5" cy="10.5" r="2.2" fill="#fff" />
    </svg>
  );
}

export function Brand() {
  return (
    <span className="brand">
      <BrandMark />
      <span className="brand__name">
        OpsPilot <span className="brand__suffix">AI</span>
      </span>
    </span>
  );
}
