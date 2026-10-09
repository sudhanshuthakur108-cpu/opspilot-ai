import { useEffect, useState } from 'react';
import { describeRequestError } from '../../api/errorMessages.js';
import { listTasks, updateTask } from '../../api/tasks.js';
import { useAuth } from '../../auth/authContext.js';
import { EmptyState } from '../../components/EmptyState.jsx';
import { Icon } from '../../components/Icon.jsx';
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

  let content;
  if (loadError) {
    content = (
      <div className="records__state" role="alert">
        <p className="records__state-title">We couldn’t load your tasks</p>
        <p className="records__state-text">{loadError}</p>
        <button type="button" className="button button--secondary button--small" onClick={retry}>
          Try again
        </button>
      </div>
    );
  } else if (!tasks) {
    content = (
      <div className="records__state records__state--loading">
        <span className="spinner" aria-hidden="true" />
        <span role="status">Loading tasks…</span>
      </div>
    );
  } else if (tasks.length === 0) {
    content = (
      <EmptyState
        icon="tasks"
        title="No tasks yet"
        description="Create a task for the work your team needs to do, on its own or for a customer or order."
      >
        {newTaskButton}
      </EmptyState>
    );
  } else {
    content = (
      <TaskTable
        tasks={tasks}
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
        <h2 id="tasks-list-title" className="records__panel-title">
          All tasks
        </h2>
        {content}
      </div>

      {creating && (
        <NewTaskDialog organizationId={organization.id} onCreated={handleCreated} onClose={() => setCreating(false)} />
      )}
    </div>
  );
}
