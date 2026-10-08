import { BrandMark } from './Brand.jsx';

export function LoadingScreen({ label }) {
  return (
    <div className="startup" role="status">
      <BrandMark />
      <span className="spinner" aria-hidden="true" />
      <span className="visually-hidden">{label}</span>
    </div>
  );
}
