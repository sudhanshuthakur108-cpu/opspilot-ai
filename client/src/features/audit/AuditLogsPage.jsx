import { useEffect, useState } from 'react';
import { listAuditLogs } from '../../api/auditLogs.js';
import { describeRequestError } from '../../api/errorMessages.js';
import { useAuth } from '../../auth/authContext.js';
import { EmptyState } from '../../components/EmptyState.jsx';
import { LoadFailure, LoadingRows } from '../../components/RecordStates.jsx';
import { canManageWorkspace } from '../organizations/roles.js';
import { AuditLogTable } from './AuditLogTable.jsx';
import '../../styles/records.css';

function Restricted() {
  return (
    <EmptyState
      icon="audit"
      title="Only owners and admins can view the audit log"
      description="Ask an owner or admin of this workspace if you need to know who changed something."
    />
  );
}

// Loads the newest page first; "Load older entries" appends the next page.
export function AuditLogsPage({ organization }) {
  const { user, endSession } = useAuth();
  const canView = canManageWorkspace(organization.role);
  const [log, setLog] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState('');

  useEffect(() => {
    if (!canView) return undefined;
    let active = true;

    listAuditLogs(organization.id)
      .then((page) => {
        if (active) setLog({ entries: page.auditLogs, page: page.page, hasMore: page.hasMore });
      })
      .catch((error) => {
        if (!active) return;
        if (error.status === 401) {
          endSession();
        } else if (error.status === 403) {
          setForbidden(true);
        } else {
          setLoadError(describeRequestError(error));
        }
      });

    return () => {
      active = false;
    };
  }, [organization.id, canView, attempt, endSession]);

  function retry() {
    setLoadError('');
    setAttempt((count) => count + 1);
  }

  async function loadMore() {
    setLoadingMore(true);
    setMoreError('');
    try {
      const next = await listAuditLogs(organization.id, { page: log.page + 1 });
      // Entries recorded since the first page shift later pages, so skip any already shown.
      setLog((current) => {
        const shown = new Set(current.entries.map((entry) => entry.id));
        return {
          entries: [...current.entries, ...next.auditLogs.filter((entry) => !shown.has(entry.id))],
          page: next.page,
          hasMore: next.hasMore,
        };
      });
    } catch (error) {
      if (error.status === 401) {
        endSession();
        return;
      }
      setMoreError(`We couldn’t load older entries. ${describeRequestError(error)}`);
    }
    setLoadingMore(false);
  }

  let content;
  if (!canView || forbidden) {
    content = <Restricted />;
  } else if (loadError) {
    content = <LoadFailure title="We couldn’t load the audit log" message={loadError} onRetry={retry} />;
  } else if (!log) {
    content = <LoadingRows label="Loading the audit log…" rows={5} />;
  } else if (log.entries.length === 0) {
    content = (
      <EmptyState
        icon="audit"
        title="No activity recorded yet"
        description="Activity will appear here when important workspace actions occur, such as a change to the workspace name or a decision on an AI proposal."
      />
    );
  } else {
    content = (
      <>
        <AuditLogTable entries={log.entries} labelledBy="audit-list-title" currentEmail={user.email} />
        {(log.hasMore || moreError) && (
          <div className="audit-more">
            {moreError && (
              <p className="alert alert--error" role="alert">
                {moreError}
              </p>
            )}
            {log.hasMore && (
              <button
                type="button"
                className="button button--secondary button--small"
                onClick={loadMore}
                disabled={loadingMore}
                aria-busy={loadingMore}
              >
                {loadingMore && <span className="spinner" aria-hidden="true" />}
                {loadingMore ? 'Loading…' : 'Load older entries'}
              </button>
            )}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="records">
      <div className="records__header">
        <p className="records__intro">
          A record of important changes in <strong>{organization.name}</strong>: who made them and when. Entries can’t be
          edited or deleted.
        </p>
      </div>

      <div className="records__panel">
        <h2 id="audit-list-title" className="records__panel-title">
          Activity
        </h2>
        {content}
      </div>
    </div>
  );
}
