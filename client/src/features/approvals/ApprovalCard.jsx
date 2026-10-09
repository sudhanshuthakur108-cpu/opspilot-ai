import { useEffect, useRef, useState } from 'react';
import { Link } from '../../components/Link.jsx';
import { TextField } from '../../components/TextField.jsx';
import { formatDueDate, priorityLabel, statusLabel } from '../tasks/taskDisplay.js';
import { actionLabel, approvalStatusLabel, canDisplayAction } from './approvalDisplay.js';

// Mirrors the server's rule so an oversized reason is caught before a request is made.
const REASON_MAX_LENGTH = 200;

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function Time({ value }) {
  return <time dateTime={value}>{timeFormat.format(new Date(value))}</time>;
}

function Detail({ label, children }) {
  return (
    <div className="approval-details__row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

// A linked record the server could no longer find in this workspace is named as such, not hidden.
function linkedName(id, name) {
  if (!id) return 'None';
  return name ?? 'Not found in this workspace';
}

// Exactly what approving would create, field by field.
function TaskDetails({ parameters }) {
  return (
    <dl className="approval-details">
      <Detail label="Title">{parameters.title}</Detail>
      {parameters.description && <Detail label="Description">{parameters.description}</Detail>}
      <Detail label="Customer">{linkedName(parameters.customerId, parameters.customerName)}</Detail>
      <Detail label="Order">{linkedName(parameters.orderId, parameters.orderDescription)}</Detail>
      <Detail label="Priority">{priorityLabel(parameters.priority)}</Detail>
      <Detail label="Status">{statusLabel(parameters.status)}</Detail>
      <Detail label="Due">{parameters.dueDate ? <time dateTime={parameters.dueDate}>{formatDueDate(parameters.dueDate)}</time> : 'No due date'}</Detail>
    </dl>
  );
}

function Outcome({ approval }) {
  const reviewer = approval.reviewedByEmail ?? 'a former member';
  if (approval.status === 'rejected') {
    return (
      <p className="approval-card__outcome">
        Rejected by {reviewer} on <Time value={approval.reviewedAt} />.
        {approval.rejectionReason && <span className="approval-card__reason"> Reason: {approval.rejectionReason}</span>}
      </p>
    );
  }
  if (approval.status === 'executed') {
    return (
      <p className="approval-card__outcome">
        Approved by {reviewer} on <Time value={approval.reviewedAt} />. The task was created.{' '}
        <Link href="/tasks">View tasks</Link>
      </p>
    );
  }
  if (approval.status === 'execution_failed') {
    return (
      <p className="approval-card__outcome approval-card__outcome--failed">
        Approved by {reviewer} on <Time value={approval.reviewedAt} />, but the task could not be created:{' '}
        {approval.failure?.message ?? 'unknown error'}. Nothing was changed.
      </p>
    );
  }
  if (approval.status === 'approved') {
    return (
      <p className="approval-card__outcome">
        Approved by {reviewer} on <Time value={approval.reviewedAt} />. The change has not been confirmed as made.
      </p>
    );
  }
  return null;
}

// One proposed change. `canReview` shows the Approve and Reject controls for a pending one;
// `busy` is "approving" or "rejecting" while that request is in flight, and every control is
// disabled until the server answers.
export function ApprovalCard({ approval, canReview, busy, onApprove, onReject }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const reasonRef = useRef(null);
  const titleId = `approval-${approval.id}-title`;
  const displayable = canDisplayAction(approval.action);
  const reviewable = canReview && approval.status === 'pending' && displayable;

  useEffect(() => {
    if (rejecting) reasonRef.current.focus();
  }, [rejecting]);

  function submitRejection(event) {
    event.preventDefault();
    if (busy) return;
    if (reason.trim().length > REASON_MAX_LENGTH) {
      setReasonError(`Use ${REASON_MAX_LENGTH} characters or fewer.`);
      reasonRef.current.focus();
      return;
    }
    onReject(reason.trim() || undefined);
  }

  return (
    <article className="approval-card" aria-labelledby={titleId} aria-busy={Boolean(busy)}>
      <header className="approval-card__header">
        <div className="approval-card__heading">
          <p className="approval-card__source">Proposed by the AI Assistant</p>
          <h3 id={titleId} className="approval-card__title">
            {actionLabel(approval.action)}
            {displayable && approval.parameters.title && <span className="approval-card__subject">: {approval.parameters.title}</span>}
          </h3>
        </div>
        <span className={`approval-status approval-status--${approval.status}`}>{approvalStatusLabel(approval.status)}</span>
      </header>

      <p className="approval-card__summary">
        <span className="visually-hidden">AI summary: </span>“{approval.summary}”
      </p>

      {displayable ? (
        <TaskDetails parameters={approval.parameters} />
      ) : (
        <p className="approval-card__unsupported">This kind of change can’t be shown on this page, so it can’t be reviewed here.</p>
      )}

      <p className="approval-card__meta">
        Requested by {approval.requestedByEmail ?? 'a former member'} on <Time value={approval.createdAt} />
      </p>

      <Outcome approval={approval} />

      {reviewable && !rejecting && (
        <div className="approval-card__actions">
          <button type="button" className="button button--secondary" onClick={() => setRejecting(true)} disabled={Boolean(busy)}>
            Reject
          </button>
          <button type="button" className="button button--primary" onClick={onApprove} disabled={Boolean(busy)} aria-busy={busy === 'approving'}>
            {busy === 'approving' && <span className="spinner" aria-hidden="true" />}
            {busy === 'approving' ? 'Approving…' : 'Approve'}
          </button>
        </div>
      )}

      {reviewable && rejecting && (
        <form className="approval-card__reject" onSubmit={submitRejection} noValidate>
          <fieldset className="approval-card__reject-fields" disabled={Boolean(busy)}>
            <TextField
              ref={reasonRef}
              id={`approval-${approval.id}-reason`}
              name="reason"
              label={
                <>
                  Reason <span className="approval-card__optional">Optional</span>
                </>
              }
              hint={`Up to ${REASON_MAX_LENGTH} characters. It is saved with the decision.`}
              multiline
              rows={2}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setReasonError('');
              }}
              error={reasonError}
            />
            <div className="approval-card__actions">
              <button
                type="button"
                className="button button--secondary"
                onClick={() => {
                  setRejecting(false);
                  setReason('');
                  setReasonError('');
                }}
              >
                Cancel
              </button>
              <button type="submit" className="button button--primary" aria-busy={busy === 'rejecting'}>
                {busy === 'rejecting' && <span className="spinner" aria-hidden="true" />}
                {busy === 'rejecting' ? 'Rejecting…' : 'Reject proposal'}
              </button>
            </div>
          </fieldset>
        </form>
      )}
    </article>
  );
}
