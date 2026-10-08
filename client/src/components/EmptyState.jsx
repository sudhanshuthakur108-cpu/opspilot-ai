import { Icon } from './Icon.jsx';
import './EmptyState.css';

// `children`, when given, is the action that gets the user out of the empty state.
export function EmptyState({ icon, title, description, children }) {
  return (
    <div className="empty-state">
      {icon && (
        <span className="empty-state__icon">
          <Icon name={icon} />
        </span>
      )}
      <p className="empty-state__title">{title}</p>
      <p className="empty-state__description">{description}</p>
      {children && <div className="empty-state__action">{children}</div>}
    </div>
  );
}
