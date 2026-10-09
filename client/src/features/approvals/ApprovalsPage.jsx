import { useEffect, useRef, useState } from 'react';
import { approveApproval, listApprovals, rejectApproval } from '../../api/approvals.js';
import { describeRequestError } from '../../api/errorMessages.js';
import { useAuth } from '../../auth/authContext.js';
import { EmptyState } from '../../components/EmptyState.jsx';
import { Link } from '../../components/Link.jsx';
import { canManageWorkspace } from '../organizations/roles.js';
import { ApprovalCard } from './ApprovalCard.jsx';
import '../../styles/records.css';
import './Approvals.css';

// The server allows up to 50 per page. Pending proposals are what people act on, so all of
// them that fit are loaded; the reviewed list only shows recent decisions.
const PENDING_LIMIT = 50;
const RECENT_LIMIT = 20;

const STEPS = [
  {
    title: 'The AI Assistant proposes a change',
    text: 'For example, a new task for an order. The proposal is saved here and nothing is changed yet.',
  },
  {
    title: 'An owner or admin reviews it',
    text: 'They see exactly what would be created, then approve or reject it.',
  },
  {
    title: 'Only approved changes are made',
    text: 'The server checks the stored proposal again, makes the change and records each step in the audit log.',
  },
];

function describeReviewError(error, verb) {
  if (error.code === 'APPROVAL_ALREADY_REVIEWED') {
    return 'Someone has already reviewed this proposal, so nothing was changed. The list has been refreshed.';
  }
  if (error.code === 'APPROVAL_NOT_FOUND') {
    return 'This proposal no longer exists. The list has been refreshed.';
  }
  if (error.status === 403) {
    return 'Only owners and admins can approve or reject proposals.';
  }
  if (error.status === 400) {
    return 'Check the reason and try again.';
  }
  return `We couldn’t ${verb} this proposal. ${describeRequestError(error)}`;
}

export function ApprovalsPage({ organization }) {
  const { endSession } = useAuth();
  const canReview = canManageWorkspace(organization.role);
  const [lists, setLists] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState({});
  const [notice, setNotice] = useState(null);
  const noticeRef = useRef(null);

  useEffect(() => {
    let active = true;

    Promise.all([
      listApprovals(organization.id, { status: 'pending', limit: PENDING_LIMIT }),
      listApprovals(organization.id, { limit: RECENT_LIMIT }),
    ])
      .then(([pending, recent]) => {
        if (!active) return;
        setLoadError('');
        setLists({
          pending: pending.approvals,
          morePending: pending.hasMore,
          reviewed: recent.approvals.filter((approval) => approval.status !== 'pending'),
        });
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

  // Moves focus to a new message, so a keyboard or screen reader user hears what happened after
  // the card they were on leaves the list.
  useEffect(() => {
    if (notice) noticeRef.current?.focus();
  }, [notice]);

  function retry() {
    setLoadError('');
    setAttempt((count) => count + 1);
  }

  // The card leaves the waiting list only once the server has answered with its new state.
  function showReviewed(updated) {
    setLists((current) => ({
      ...current,
      pending: current.pending.filter((approval) => approval.id !== updated.id),
      reviewed: [updated, ...current.reviewed.filter((approval) => approval.id !== updated.id)],
    }));
  }

  async function review(approval, kind, request) {
    if (busy[approval.id]) return;
    setBusy((current) => ({ ...current, [approval.id]: kind }));
    setNotice(null);
    try {
      const updated = await request();
      showReviewed(updated);
      setNotice(describeOutcome(updated));
    } catch (error) {
      if (error.status === 401) {
        endSession();
        return;
      }
      setNotice({ kind: 'error', text: describeReviewError(error, kind === 'approving' ? 'approve' : 'reject') });
      if (error.code === 'APPROVAL_ALREADY_REVIEWED' || error.code === 'APPROVAL_NOT_FOUND') {
        setAttempt((count) => count + 1);
      }
    } finally {
      setBusy((current) => {
        const next = { ...current };
        delete next[approval.id];
        return next;
      });
    }
  }

  function describeOutcome(approval) {
    const title = approval.parameters.title;
    if (approval.status === 'executed') {
      return { kind: 'success', text: `Approved. The task “${title}” was created.`, link: true };
    }
    if (approval.status === 'rejected') {
      return { kind: 'success', text: `Rejected. The task “${title}” was not created.` };
    }
    if (approval.status === 'execution_failed') {
      const reason = approval.failure?.message ?? 'unknown error';
      return { kind: 'error', text: `Approved, but the task “${title}” could not be created: ${reason}. Nothing was changed.` };
    }
    return { kind: 'error', text: 'The proposal was approved, but the change was not confirmed. Refresh to see its status.' };
  }

  let waiting;
  let reviewed = null;
  if (loadError) {
    waiting = (
      <div className="records__state" role="alert">
        <p className="records__state-title">We couldn’t load approvals</p>
        <p className="records__state-text">{loadError}</p>
        <button type="button" className="button button--secondary button--small" onClick={retry}>
          Try again
        </button>
      </div>
    );
  } else if (!lists) {
    waiting = (
      <div className="records__state records__state--loading">
        <span className="spinner" aria-hidden="true" />
        <span role="status">Loading approvals…</span>
      </div>
    );
  } else {
    waiting =
      lists.pending.length === 0 ? (
        <EmptyState
          icon="approvals"
          title="No approvals waiting"
          description="When you ask the AI Assistant for a new task, its proposal waits here until an owner or admin approves it."
        >
          <Link className="button button--secondary button--small" href="/assistant">
            Open AI Assistant
          </Link>
        </EmptyState>
      ) : (
        <>
          <ul className="approval-list" aria-label="Waiting for approval">
            {lists.pending.map((approval) => (
              <li key={approval.id}>
                <ApprovalCard
                  approval={approval}
                  canReview={canReview}
                  busy={busy[approval.id]}
                  onApprove={() => review(approval, 'approving', () => approveApproval(organization.id, approval.id))}
                  onReject={(reason) => review(approval, 'rejecting', () => rejectApproval(organization.id, approval.id, reason))}
                />
              </li>
            ))}
          </ul>
          {lists.morePending && (
            <p className="approvals__more">Showing the {PENDING_LIMIT} newest. Review these to see older ones.</p>
          )}
        </>
      );
    reviewed =
      lists.reviewed.length === 0 ? (
        <p className="approvals__none">No decisions yet.</p>
      ) : (
        <ul className="approval-list" aria-label="Recently reviewed">
          {lists.reviewed.map((approval) => (
            <li key={approval.id}>
              <ApprovalCard approval={approval} canReview={false} />
            </li>
          ))}
        </ul>
      );
  }

  return (
    <div className="records">
      <div className="records__header">
        <p className="records__intro">
          Changes the AI Assistant proposes for <strong>{organization.name}</strong> wait here. Nothing changes until an owner
          or admin approves.
        </p>
      </div>

      {notice && (
        <div
          ref={noticeRef}
          tabIndex={-1}
          className={notice.kind === 'success' ? 'alert alert--success approvals__notice' : 'alert alert--error approvals__notice'}
          role={notice.kind === 'success' ? 'status' : 'alert'}
        >
          {notice.text}
          {notice.link && (
            <>
              {' '}
              <Link href="/tasks">View tasks</Link>
            </>
          )}
        </div>
      )}

      {!canReview && (
        <p className="alert approvals__role-note">
          Only owners and admins can approve or reject proposals. You can see what is waiting and what was decided.
        </p>
      )}

      <section className="records__panel" aria-labelledby="approvals-waiting-title">
        <h2 id="approvals-waiting-title" className="records__panel-title">
          Waiting for approval
        </h2>
        {waiting}
      </section>

      {reviewed && (
        <section className="records__panel" aria-labelledby="approvals-reviewed-title">
          <h2 id="approvals-reviewed-title" className="records__panel-title">
            Recently reviewed
          </h2>
          {reviewed}
        </section>
      )}

      <section className="records__panel" aria-labelledby="approvals-how-title">
        <h2 id="approvals-how-title" className="records__panel-title">
          How approvals work
        </h2>
        <ol className="approvals-steps">
          {STEPS.map((step) => (
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
