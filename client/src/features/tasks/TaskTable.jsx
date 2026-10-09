import { TASK_STATUSES, formatDueDate, priorityLabel } from './taskDisplay.js';
import '../../styles/records.css';
import './Tasks.css';

const createdFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

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

// `savingStatus` maps a task ID to the status being saved for it. Until the server confirms,
// that row's control shows the new status but stays disabled.
export function TaskTable({ tasks, labelledBy, highlightId, savingStatus, onStatusChange }) {
  return (
    <div className="records-table" role="region" aria-labelledby={labelledBy} tabIndex={0}>
      <table>
        <thead>
          <tr>
            <th scope="col">Task</th>
            <th scope="col">Customer</th>
            <th scope="col">Order</th>
            <th scope="col">Priority</th>
            <th scope="col">Status</th>
            <th scope="col">Due</th>
            <th scope="col">Created</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const saving = savingStatus[task.id];
            return (
              <tr key={task.id} className={task.id === highlightId ? 'records-table__row--new' : undefined}>
                <th scope="row" className="task-table__task">
                  <span className="task-table__title">{task.title}</span>
                  {task.description && <span className="task-table__description">{task.description}</span>}
                </th>
                <td>{task.customerName ?? <None />}</td>
                <td className="task-table__order">{task.orderDescription ?? <None />}</td>
                <td>
                  <span className={`task-priority task-priority--${task.priority}`}>{priorityLabel(task.priority)}</span>
                </td>
                <td>
                  <span className="task-status">
                    <select
                      className="task-status__select"
                      aria-label={`Status of ${task.title}`}
                      value={saving ?? task.status}
                      disabled={saving !== undefined}
                      aria-busy={saving !== undefined}
                      onChange={(event) => onStatusChange(task, event.target.value)}
                    >
                      {TASK_STATUSES.map(({ value, label }) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    {saving !== undefined && <span className="spinner task-status__spinner" aria-hidden="true" />}
                  </span>
                </td>
                <td className="task-table__date">
                  {task.dueDate ? <time dateTime={task.dueDate}>{formatDueDate(task.dueDate)}</time> : <None />}
                </td>
                <td className="task-table__date">
                  <time dateTime={task.createdAt}>{createdFormat.format(new Date(task.createdAt))}</time>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
