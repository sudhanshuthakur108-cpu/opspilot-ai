import { useEffect, useState } from 'react';
import { listCustomers } from '../../api/customers.js';
import { describeRequestError } from '../../api/errorMessages.js';
import { useAuth } from '../../auth/authContext.js';
import { EmptyState } from '../../components/EmptyState.jsx';
import { Icon } from '../../components/Icon.jsx';
import { ListFilter, LoadFailure, LoadingRows, matchesQuery } from '../../components/RecordStates.jsx';
import { CustomerTable } from './CustomerTable.jsx';
import { NewCustomerDialog } from './NewCustomerDialog.jsx';
import '../../styles/records.css';

export function CustomersPage({ organization }) {
  const { endSession } = useAuth();
  const [customers, setCustomers] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let active = true;

    listCustomers(organization.id)
      .then((list) => {
        if (active) setCustomers(list);
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

  // The new customer comes back from the create request, so the list is not reloaded.
  function handleCreated(customer) {
    setCustomers((current) => [customer, ...current]);
    setAdded(customer);
  }

  const addButton = (
    <button type="button" className="button button--primary" onClick={() => setAdding(true)}>
      <Icon name="plus" size={18} />
      Add customer
    </button>
  );

  const shown = customers?.filter((customer) => matchesQuery(query, customer.name, customer.email, customer.phone)) ?? [];

  let content;
  if (loadError) {
    content = <LoadFailure title="We couldn’t load your customers" message={loadError} onRetry={retry} />;
  } else if (!customers) {
    content = <LoadingRows label="Loading customers…" />;
  } else if (customers.length === 0) {
    content = (
      <EmptyState
        icon="customers"
        title="No customers yet"
        description="Customers are the people and businesses your team works with. Orders and tasks are recorded against them."
      >
        {addButton}
      </EmptyState>
    );
  } else if (shown.length === 0) {
    content = <p className="records__no-match">No customers match “{query.trim()}”.</p>;
  } else {
    content = <CustomerTable customers={shown} labelledBy="customers-list-title" highlightId={added?.id} />;
  }

  return (
    <div className="records">
      <div className="records__header">
        <p className="records__intro">
          The people and businesses <strong>{organization.name}</strong> works with.
        </p>
        {customers && customers.length > 0 && addButton}
      </div>

      <div role="status" className="records__notice">
        {added && (
          <p className="alert alert--success">
            <strong>{added.name}</strong> was added.
          </p>
        )}
      </div>

      <div className="records__panel">
        <div className="records__panel-header">
          <div className="records__panel-title">
            <h2 id="customers-list-title">All customers</h2>
            {customers && customers.length > 0 && <span className="records__count">{customers.length}</span>}
          </div>
          {customers && customers.length > 0 && (
            <ListFilter id="customers-filter" label="Filter customers" placeholder="Filter customers" value={query} onChange={setQuery} />
          )}
        </div>
        {content}
      </div>

      {adding && (
        <NewCustomerDialog organizationId={organization.id} onCreated={handleCreated} onClose={() => setAdding(false)} />
      )}
    </div>
  );
}
