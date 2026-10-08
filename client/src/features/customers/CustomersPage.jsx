import { useEffect, useState } from 'react';
import { listCustomers } from '../../api/customers.js';
import { describeRequestError } from '../../api/errorMessages.js';
import { useAuth } from '../../auth/authContext.js';
import { EmptyState } from '../../components/EmptyState.jsx';
import { Icon } from '../../components/Icon.jsx';
import { CustomerTable } from './CustomerTable.jsx';
import { NewCustomerDialog } from './NewCustomerDialog.jsx';
import './CustomersPage.css';

export function CustomersPage({ organization }) {
  const { endSession } = useAuth();
  const [customers, setCustomers] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(null);

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

  let content;
  if (loadError) {
    content = (
      <div className="customers__state" role="alert">
        <p className="customers__state-title">We couldn’t load your customers</p>
        <p className="customers__state-text">{loadError}</p>
        <button type="button" className="button button--secondary button--small" onClick={retry}>
          Try again
        </button>
      </div>
    );
  } else if (!customers) {
    content = (
      <div className="customers__state customers__state--loading">
        <span className="spinner" aria-hidden="true" />
        <span role="status">Loading customers…</span>
      </div>
    );
  } else if (customers.length === 0) {
    content = (
      <EmptyState
        icon="customers"
        title="No customers yet"
        description="Add the people and businesses your team works with, and they’ll be listed here."
      >
        {addButton}
      </EmptyState>
    );
  } else {
    content = <CustomerTable customers={customers} labelledBy="customers-list-title" highlightId={added?.id} />;
  }

  return (
    <div className="customers">
      <div className="customers__header">
        <p className="customers__intro">
          The people and businesses <strong>{organization.name}</strong> works with.
        </p>
        {customers && customers.length > 0 && addButton}
      </div>

      <div role="status" className="customers__notice">
        {added && (
          <p className="alert alert--success">
            <strong>{added.name}</strong> was added.
          </p>
        )}
      </div>

      <div className="customers__panel">
        <h2 id="customers-list-title" className="customers__panel-title">
          All customers
        </h2>
        {content}
      </div>

      {adding && (
        <NewCustomerDialog organizationId={organization.id} onCreated={handleCreated} onClose={() => setAdding(false)} />
      )}
    </div>
  );
}
