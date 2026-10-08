import { Icon } from './Icon.jsx';
import './EmptyState.css';

export function EmptyState({ icon, title, description }) {
  return (
    <div className="empty-state">
      {icon && (
        <span className="empty-state__icon">
          <Icon name={icon} />
        </span>
      )}
      <p className="empty-state__title">{title}</p>
      <p className="empty-state__description">{description}</p>
    </div>
  );
}
