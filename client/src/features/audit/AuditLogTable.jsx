import { actionLabel, actorLabel, describeDetails, resourceLabel } from './auditDisplay.js';
import '../../styles/records.css';
import './Audit.css';

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

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
              <td className="audit-table__time">
                <time dateTime={entry.createdAt}>{timeFormat.format(new Date(entry.createdAt))}</time>
              </td>
              <td className="audit-table__actor">
                <span className={`audit-actor audit-actor--${entry.actorType}`}>{actorLabel(entry, currentEmail)}</span>
              </td>
              <th scope="row" className="audit-table__action">
                {actionLabel(entry.action)}
              </th>
              <td className="audit-table__resource">{resourceLabel(entry.resourceType)}</td>
              <td className="audit-table__details">{describeDetails(entry) ?? <None />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
