import { useEffect, useState } from 'react';
import { listApprovals } from '../../api/approvals.js';
import { listAuditLogs } from '../../api/auditLogs.js';
import { listCustomers } from '../../api/customers.js';
import { listOrders } from '../../api/orders.js';
import { listTasks } from '../../api/tasks.js';
import { useAuth } from '../../auth/authContext.js';
import { displayName } from '../../auth/displayName.js';
import { Icon } from '../../components/Icon.jsx';
import { Link } from '../../components/Link.jsx';
import { formatRelative, todayKey } from '../../formatTime.js';
import { actionLabel, actorLabel } from '../audit/auditDisplay.js';
import { formatAmount, statusLabel as orderStatusLabel } from '../orders/orderDisplay.js';
import { canManageWorkspace } from '../organizations/roles.js';
import { formatDueDate, priorityLabel } from '../tasks/taskDisplay.js';
import './DashboardOverview.css';

// The customer, order and task lists return at most this many of the newest records, so a full
// list means there may be more, and counts drawn from it are shown as "at least".
const LIST_LIMIT = 50;
const PREVIEW_SIZE = 5;

const dateFormat = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

const OPEN_ORDER_STATUSES = ['pending', 'confirmed'];
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

// Loads each part of the overview on its own, so one failed request leaves the rest usable.
// Each entry is undefined while loading, { data } once loaded or { failed: true }.
function useOverviewData(organization) {
  const { endSession } = useAuth();
  const canViewActivity = canManageWorkspace(organization.role);
  const [sections, setSections] = useState({});
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const requests = {
      customers: () => listCustomers(organization.id),
      orders: () => listOrders(organization.id),
      tasks: () => listTasks(organization.id),
      approvals: () => listApprovals(organization.id, { status: 'pending', limit: LIST_LIMIT }),
    };
    if (canViewActivity) requests.activity = () => listAuditLogs(organization.id);

    for (const [key, request] of Object.entries(requests)) {
      request()
        .then((data) => {
          if (active) setSections((current) => ({ ...current, [key]: { data } }));
        })
        .catch((error) => {
          if (!active) return;
          if (error.status === 401) endSession();
          else setSections((current) => ({ ...current, [key]: { failed: true } }));
        });
    }

    return () => {
      active = false;
    };
  }, [organization.id, canViewActivity, attempt, endSession]);

  function retry() {
    setSections({});
    setAttempt((count) => count + 1);
  }

  return { sections, retry, canViewActivity };
}

const countText = (count, capped) => (capped ? `${count}+` : String(count));

function Stat({ label, href, section, value, note }) {
  let content;
  if (!section) {
    content = <span className="skeleton stat__skeleton" aria-hidden="true" />;
  } else if (section.failed) {
    content = <span className="stat__value stat__value--unavailable">Unavailable</span>;
  } else {
    content = <span className="stat__value">{value(section.data)}</span>;
  }

  return (
    <li>
      <Link className="stat" href={href}>
        <span className="stat__label">{label}</span>
        {content}
        <span className="stat__note">{section?.data ? note(section.data) : ' '}</span>
      </Link>
    </li>
  );
}

function Panel({ title, id, action, children }) {
  return (
    <section className="overview-panel" aria-labelledby={id}>
      <div className="overview-panel__header">
        <h2 id={id} className="overview-panel__title">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

// Placeholder rows while a panel loads. The label is read with the panel rather than announced,
// so several panels loading at once do not all speak.
function PanelSkeleton({ label }) {
  return (
    <div className="overview-skeleton" aria-busy="true">
      {[0, 1, 2].map((row) => (
        <div key={row} className="overview-skeleton__row">
          <span className="skeleton" style={{ width: `${60 - row * 12}%` }} />
          <span className="skeleton overview-skeleton__short" />
        </div>
      ))}
      <span className="visually-hidden">{label}</span>
    </div>
  );
}

function PanelMessage({ title, text, children }) {
  return (
    <div className="overview-message">
      <p className="overview-message__title">{title}</p>
      {text && <p className="overview-message__text">{text}</p>}
      {children}
    </div>
  );
}

function PanelFailed({ what, onRetry }) {
  return (
    <PanelMessage title={`We couldn’t load ${what}`} text="Check your connection, then try again.">
      <button type="button" className="button button--secondary button--small" onClick={onRetry}>
        Try again
      </button>
    </PanelMessage>
  );
}

function dueLabel(dueDate, today) {
  if (dueDate < today) return { text: `Overdue · ${formatDueDate(dueDate)}`, tone: 'danger' };
  if (dueDate === today) return { text: 'Due today', tone: 'warning' };
  return { text: `Due ${formatDueDate(dueDate)}`, tone: 'neutral' };
}

// Open tasks, the most pressing first: overdue and soonest due, then by priority.
function tasksNeedingAttention(tasks) {
  return tasks
    .filter((task) => task.status !== 'completed')
    .sort(
      (a, b) =>
        (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
    )
    .slice(0, PREVIEW_SIZE);
}

function TaskPreview({ tasks }) {
  const today = todayKey();
  return (
    <ul className="overview-list">
      {tasks.map((task) => {
        const due = task.dueDate && dueLabel(task.dueDate, today);
        return (
          <li key={task.id} className="overview-list__item">
            <div className="overview-list__main">
              <span className="overview-list__title">{task.title}</span>
              <span className="overview-list__meta">{task.customerName ?? 'No customer'}</span>
            </div>
            <div className="overview-list__aside">
              {due && <span className={`badge badge--${due.tone}`}>{due.text}</span>}
              <span className={`task-priority task-priority--${task.priority}`}>{priorityLabel(task.priority)}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function OrderPreview({ orders }) {
  return (
    <ul className="overview-list">
      {orders.map((order) => (
        <li key={order.id} className="overview-list__item">
          <div className="overview-list__main">
            <span className="overview-list__title">{order.description}</span>
            <span className="overview-list__meta">{order.customerName ?? 'Unknown customer'}</span>
          </div>
          <div className="overview-list__aside">
            <span className={`order-status order-status--${order.status}`}>{orderStatusLabel(order.status)}</span>
            <span className="overview-list__amount">{formatAmount(order.totalAmount, order.currency)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ActivityPreview({ entries, currentEmail }) {
  return (
    <ol className="overview-activity">
      {entries.map((entry) => (
        <li key={entry.id} className="overview-activity__item">
          <span className={`overview-activity__icon overview-activity__icon--${entry.actorType}`} aria-hidden="true">
            <Icon name={entry.actorType === 'ai' ? 'assistant' : 'user'} size={16} />
          </span>
          <span className="overview-activity__text">
            <span className="overview-activity__action">{actionLabel(entry.action)}</span>
            <span className="overview-activity__meta">
              {actorLabel(entry, currentEmail)} · <time dateTime={entry.createdAt}>{formatRelative(entry.createdAt)}</time>
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

// Shown until the workspace has its first customer, order and task: each step is checked off
// from the real lists.
function GettingStarted({ customers, orders, tasks }) {
  const steps = [
    { done: customers.length > 0, title: 'Add a customer', text: 'The people and businesses you work with.', href: '/customers' },
    { done: orders.length > 0, title: 'Record an order', text: 'What a customer ordered, and its status.', href: '/orders' },
    { done: tasks.length > 0, title: 'Create a task', text: 'Work to do, linked to a customer or order.', href: '/tasks' },
  ];
  const completed = steps.filter((step) => step.done).length;

  return (
    <section className="getting-started" aria-labelledby="getting-started-title">
      <div className="getting-started__header">
        <h2 id="getting-started-title" className="overview-panel__title">
          Set up your workspace
        </h2>
        <span className="getting-started__progress">
          {completed} of {steps.length} done
        </span>
      </div>
      <ol className="getting-started__steps">
        {steps.map((step) => (
          <li key={step.href} className={step.done ? 'getting-started__step getting-started__step--done' : 'getting-started__step'}>
            <span className="getting-started__check" aria-hidden="true">
              {step.done && <Icon name="check" size={14} />}
            </span>
            <span className="getting-started__text">
              <Link className="getting-started__link" href={step.href}>
                {step.title}
              </Link>
              <span>{step.done ? 'Done' : step.text}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function DashboardOverview({ organization, justCreated }) {
  const { user } = useAuth();
  const { sections, retry, canViewActivity } = useOverviewData(organization);
  const name = displayName(user);
  const greeting = justCreated ? 'Welcome' : 'Welcome back';
  const { customers, orders, tasks, approvals, activity } = sections;
  const allLoaded = customers?.data && orders?.data && tasks?.data;
  const pendingApprovals = approvals?.data?.approvals.length ?? 0;

  return (
    <div className="overview">
      {justCreated && (
        <p className="alert alert--success overview__notice" role="status">
          <strong>{organization.name}</strong> is ready. You’re its owner.
        </p>
      )}

      <div className="overview__hero">
        <div className="overview__welcome">
          <p className="overview__date">{dateFormat.format(new Date())}</p>
          <h2 className="overview__greeting">{name ? `${greeting}, ${name}` : greeting}</h2>
          <p className="overview__lead">
            Here’s what needs attention in <strong>{organization.name}</strong>.
          </p>
        </div>
        <Link className="button button--primary" href="/assistant">
          <Icon name="assistant" size={18} />
          Ask the AI Assistant
        </Link>
      </div>

      <ul className="overview__stats" aria-label="Workspace at a glance">
        <Stat
          label="Customers"
          href="/customers"
          section={customers}
          value={(list) => countText(list.length, list.length >= LIST_LIMIT)}
          note={(list) => (list.length >= LIST_LIMIT ? 'Counting the newest 50' : 'In this workspace')}
        />
        <Stat
          label="Open orders"
          href="/orders"
          section={orders}
          value={(list) => countText(list.filter((order) => OPEN_ORDER_STATUSES.includes(order.status)).length, list.length >= LIST_LIMIT)}
          note={(list) => (list.length >= LIST_LIMIT ? 'Among the newest 50' : 'Pending or confirmed')}
        />
        <Stat
          label="Open tasks"
          href="/tasks"
          section={tasks}
          value={(list) => countText(list.filter((task) => task.status !== 'completed').length, list.length >= LIST_LIMIT)}
          note={(list) => {
            const today = todayKey();
            const overdue = list.filter((task) => task.status !== 'completed' && task.dueDate && task.dueDate < today).length;
            return overdue > 0 ? `${overdue} overdue` : 'To do or in progress';
          }}
        />
        <Stat
          label="Awaiting approval"
          href="/approvals"
          section={approvals}
          value={(page) => countText(page.approvals.length, page.hasMore)}
          note={(page) => (page.approvals.length > 0 ? 'AI proposals to review' : 'Nothing to review')}
        />
      </ul>

      {allLoaded && (customers.data.length === 0 || orders.data.length === 0 || tasks.data.length === 0) && (
        <GettingStarted customers={customers.data} orders={orders.data} tasks={tasks.data} />
      )}

      <div className="overview__grid">
        <Panel
          title="Tasks needing attention"
          id="overview-tasks-title"
          action={
            <Link className="text-link overview-panel__link" href="/tasks">
              All tasks <Icon name="arrowRight" size={16} />
            </Link>
          }
        >
          {!tasks && <PanelSkeleton label="Loading tasks…" />}
          {tasks?.failed && <PanelFailed what="tasks" onRetry={retry} />}
          {tasks?.data &&
            (tasksNeedingAttention(tasks.data).length > 0 ? (
              <TaskPreview tasks={tasksNeedingAttention(tasks.data)} />
            ) : (
              <PanelMessage
                title={tasks.data.length > 0 ? 'Every task is complete' : 'No tasks yet'}
                text={
                  tasks.data.length > 0
                    ? 'Open tasks will be listed here, the most urgent first.'
                    : 'Tasks track the work your team does for customers and orders.'
                }
              />
            ))}
        </Panel>

        <section className="overview-panel assistant-card" aria-labelledby="overview-assistant-title">
          <div className="overview-panel__header">
            <h2 id="overview-assistant-title" className="overview-panel__title assistant-card__title">
              <span className="assistant-card__icon" aria-hidden="true">
                <Icon name="assistant" size={18} />
              </span>
              AI Assistant
            </h2>
            <span className="badge badge--accent">Changes need approval</span>
          </div>
          <p className="assistant-card__text">
            Ask about your customers, orders and tasks. It can read your records and propose new tasks, but it can’t change
            anything until an owner or admin approves.
          </p>
          <ul className="assistant-card__abilities">
            <li>
              <Icon name="eye" size={16} /> Reads customers, orders and tasks
            </li>
            <li>
              <Icon name="tasks" size={16} /> Proposes tasks for review
            </li>
            <li>
              <Icon name="approvals" size={16} /> Never changes data on its own
            </li>
          </ul>
          {pendingApprovals > 0 && (
            <Link className="assistant-card__pending" href="/approvals">
              <span className="badge__dot" aria-hidden="true" />
              {countText(pendingApprovals, approvals.data.hasMore)} {pendingApprovals === 1 ? 'proposal is' : 'proposals are'} waiting
              for review
              <Icon name="arrowRight" size={16} />
            </Link>
          )}
          <Link className="button button--secondary assistant-card__open" href="/assistant">
            Open AI Assistant
          </Link>
        </section>

        <Panel
          title="Recent orders"
          id="overview-orders-title"
          action={
            <Link className="text-link overview-panel__link" href="/orders">
              All orders <Icon name="arrowRight" size={16} />
            </Link>
          }
        >
          {!orders && <PanelSkeleton label="Loading orders…" />}
          {orders?.failed && <PanelFailed what="orders" onRetry={retry} />}
          {orders?.data &&
            (orders.data.length > 0 ? (
              <OrderPreview orders={orders.data.slice(0, PREVIEW_SIZE)} />
            ) : (
              <PanelMessage title="No orders yet" text="Orders you record for your customers will appear here, newest first." />
            ))}
        </Panel>

        <Panel
          title="Recent activity"
          id="activity-title"
          action={
            canViewActivity && (
              <Link className="text-link overview-panel__link" href="/audit-logs">
                View audit log <Icon name="arrowRight" size={16} />
              </Link>
            )
          }
        >
          {!canViewActivity && (
            <PanelMessage
              title="Activity is kept in the audit log"
              text="Important workspace changes are recorded with who made them and when. Owners and admins can review them."
            />
          )}
          {canViewActivity && !activity && <PanelSkeleton label="Loading activity…" />}
          {activity?.failed && <PanelFailed what="recent activity" onRetry={retry} />}
          {activity?.data &&
            (activity.data.auditLogs.length > 0 ? (
              <ActivityPreview entries={activity.data.auditLogs.slice(0, PREVIEW_SIZE)} currentEmail={user.email} />
            ) : (
              <PanelMessage
                title="No activity recorded yet"
                text="Changes to workspace settings and decisions on AI proposals will be listed here."
              />
            ))}
        </Panel>
      </div>
    </div>
  );
}
