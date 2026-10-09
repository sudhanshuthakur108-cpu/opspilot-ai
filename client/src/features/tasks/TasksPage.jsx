import { useEffect, useState } from 'react';
import { describeRequestError } from '../../api/errorMessages.js';
import { listTasks, updateTask } from '../../api/tasks.js';
import { useAuth } from '../../auth/authContext.js';
import { EmptyState } from '../../components/EmptyState.jsx';
import { Icon } from '../../components/Icon.jsx';
import { ListFilter, LoadFailure, LoadingRows, matchesQuery } from '../../components/RecordStates.jsx';
import { NewTaskDialog } from './NewTaskDialog.jsx';
import { TaskTable } from './TaskTable.jsx';
import { statusLabel } from './taskDisplay.js';
import '../../styles/records.css';

export function TasksPage({ organization }) {
  const { endSession } = useAuth();
  const [tasks, setTasks] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null);
  const [savingStatus, setSavingStatus] = useState({});
  const [statusError, setStatusError] = useState('');
  const [statusNotice, setStatusNotice] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let active = true;

    listTasks(organization.id)
      .then((list) => {
        if (active) setTasks(list);
      })
      .catch((error) => {
        if (!active) return;
        if (error.status === 401) {
          endSession();
        } else {
          setLoadError(describeRequestError(error));
        }
      });

    return () => {
      active = false;
    };
  }, [organization.id, attempt, endSession]);

  function retry() {
    setLoadError('');
    setAttempt((count) => count + 1);
  }

  // The new task comes back from the create request, so the list is not reloaded.
  function handleCreated(task) {
    setTasks((current) => [task, ...current]);
    setCreated(task);
  }

  // The row keeps its old status until the server returns the updated task.
  async function changeStatus(task, status) {
    setSavingStatus((current) => ({ ...current, [task.id]: status }));
    setStatusError('');
    setStatusNotice('');
    try {
      const updated = await updateTask(organization.id, task.id, { status });
      setTasks((current) => current.map((existing) => (existing.id === updated.id ? updated : existing)));
      setStatusNotice(`“${updated.title}” is now ${statusLabel(updated.status)}.`);
    } catch (error) {
      if (error.status === 401) {
        endSession();
        return;
      }
      setStatusError(
        error.code === 'TASK_NOT_FOUND'
          ? `“${task.title}” no longer exists.`
          : `We couldn’t update “${task.title}”. ${describeRequestError(error)}`,
      );
    } finally {
      setSavingStatus((current) => {
        const next = { ...current };
        delete next[task.id];
        return next;
      });
    }
  }

  const newTaskButton = (
    <button type="button" className="button button--primary" onClick={() => setCreating(true)}>
      <Icon name="plus" size={18} />
      New task
    </button>
  );

  const shown =
    tasks?.filter((task) => matchesQuery(query, task.title, task.description, task.customerName, task.orderDescription, statusLabel(task.status))) ?? [];

  let content;
  if (loadError) {
    content = <LoadFailure title="We couldn’t load your tasks" message={loadError} onRetry={retry} />;
  } else if (!tasks) {
    content = <LoadingRows label="Loading tasks…" />;
  } else if (tasks.length === 0) {
    content = (
      <EmptyState
        icon="tasks"
        title="No tasks yet"
        description="Tasks track the work your team does, on their own or for a customer or order. The AI Assistant can also propose them for approval."
      >
        {newTaskButton}
      </EmptyState>
    );
  } else if (shown.length === 0) {
    content = <p className="records__no-match">No tasks match “{query.trim()}”.</p>;
  } else {
    content = (
      <TaskTable
        tasks={shown}
        labelledBy="tasks-list-title"
        highlightId={created?.id}
        savingStatus={savingStatus}
        onStatusChange={changeStatus}
      />
    );
  }

  return (
    <div className="records">
      <div className="records__header">
        <p className="records__intro">
          The work your team is doing for the customers and orders of <strong>{organization.name}</strong>.
        </p>
        {tasks && tasks.length > 0 && newTaskButton}
      </div>

      <div role="status" className="records__notice">
        {created && (
          <p className="alert alert--success">
            Task <strong>{created.title}</strong> was added.
          </p>
        )}
      </div>
      <p role="status" className="visually-hidden">
        {statusNotice}
      </p>
      {statusError && (
        <p className="alert alert--error" role="alert">
          {statusError}
        </p>
      )}

      <div className="records__panel">
        <div className="records__panel-header">
          <div className="records__panel-title">
            <h2 id="tasks-list-title">All tasks</h2>
            {tasks && tasks.length > 0 && <span className="records__count">{tasks.length}</span>}
          </div>
          {tasks && tasks.length > 0 && (
            <ListFilter id="tasks-filter" label="Filter tasks" placeholder="Filter tasks" value={query} onChange={setQuery} />
          )}
        </div>
        {content}
      </div>

      {creating && (
        <NewTaskDialog organizationId={organization.id} onCreated={handleCreated} onClose={() => setCreating(false)} />
      )}
    </div>
  );
}
