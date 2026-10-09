import { Icon } from '../../components/Icon.jsx';
import { formatRelative } from '../../formatTime.js';
import { actionLabel, actorLabel, describeDetails, resourceLabel } from './auditDisplay.js';
import '../../styles/records.css';
import './Audit.css';

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const ACTOR_ICONS = { user: 'user', ai: 'assistant', system: 'settings' };

function None() {
  return (
    <>
      <span className="records-table__missing" aria-hidden="true">
        —
      </span>
      <span className="visually-hidden">None</span>
    </>
  );
}

// Entries arrive newest first and are shown in that order. Every value from the server is
// rendered as plain text.
export function AuditLogTable({ entries, labelledBy, currentEmail }) {
  return (
    <div className="records-table" role="region" aria-labelledby={labelledBy} tabIndex={0}>
      <table>
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">Actor</th>
            <th scope="col">Action</th>
            <th scope="col">Resource</th>
            <th scope="col">Details</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td className="audit-table__time" data-label="Time">
                <time dateTime={entry.createdAt}>{timeFormat.format(new Date(entry.createdAt))}</time>
                <span className="audit-table__relative">{formatRelative(entry.createdAt)}</span>
              </td>
              <td className="audit-table__actor" data-label="Actor">
                <span className={`audit-actor audit-actor--${entry.actorType}`}>
                  <span className="audit-actor__icon" aria-hidden="true">
                    <Icon name={ACTOR_ICONS[entry.actorType] ?? 'user'} size={14} />
                  </span>
                  {actorLabel(entry, currentEmail)}
                </span>
              </td>
              <th scope="row" className="audit-table__action" data-label="Action">
                {actionLabel(entry.action)}
              </th>
              <td className="audit-table__resource" data-label="Resource">
                {resourceLabel(entry.resourceType)}
              </td>
              <td className="audit-table__details" data-label="Details">
                {describeDetails(entry) ?? <None />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
