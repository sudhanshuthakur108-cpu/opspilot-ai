import { EmptyState } from '../../components/EmptyState.jsx';
import '../../styles/records.css';
import './Approvals.css';

// The planned flow, shown so the empty list makes sense. Nothing here is live yet.
const PLANNED_STEPS = [
  {
    title: 'The AI Assistant proposes a change',
    text: 'For example, a new task for an order. The proposal is saved for review and nothing is changed yet.',
  },
  {
    title: 'A teammate reviews it here',
    text: 'They see exactly what would change, then approve or reject it.',
  },
  {
    title: 'Only approved changes are applied',
    text: 'The server applies the change it stored, and the decision is recorded in the audit log.',
  },
];

// There is no approvals API yet: the AI Assistant can only read records, so nothing can be waiting
// for approval. When the API exists, the waiting list loads into the first panel.
export function ApprovalsPage({ organization }) {
  return (
    <div className="records">
      <div className="records__header">
        <p className="records__intro">
          Changes the AI proposes for <strong>{organization.name}</strong> will wait here until someone on your team
          approves them.
        </p>
      </div>

      <section className="records__panel" aria-labelledby="approvals-waiting-title">
        <h2 id="approvals-waiting-title" className="records__panel-title">
          Waiting for approval
        </h2>
        <EmptyState
          icon="approvals"
          title="No approvals waiting"
          description="Approval requests will appear here when the AI Assistant can propose changes to your operations."
        />
      </section>

      <section className="records__panel" aria-labelledby="approvals-how-title">
        <div className="approvals-how__header">
          <h2 id="approvals-how-title" className="records__panel-title">
            How approvals will work
          </h2>
          <span className="status-badge">Planned</span>
        </div>
        <p className="approvals-how__current">
          Today the AI Assistant has read-only access: it can read customers, orders and tasks, but it can’t propose or
          make changes.
        </p>
        <ol className="approvals-steps">
          {PLANNED_STEPS.map((step) => (
            <li key={step.title} className="approvals-steps__item">
              <p className="approvals-steps__title">{step.title}</p>
              <p className="approvals-steps__text">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
