import { useEffect, useState } from 'react';
import { describeRequestError } from '../../api/errorMessages.js';
import { listOrders } from '../../api/orders.js';
import { useAuth } from '../../auth/authContext.js';
import { EmptyState } from '../../components/EmptyState.jsx';
import { Icon } from '../../components/Icon.jsx';
import { NewOrderDialog } from './NewOrderDialog.jsx';
import { OrderTable } from './OrderTable.jsx';
import '../../styles/records.css';

export function OrdersPage({ organization }) {
  const { endSession } = useAuth();
  const [orders, setOrders] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null);

  useEffect(() => {
    let active = true;

    listOrders(organization.id)
      .then((list) => {
        if (active) setOrders(list);
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

  // The new order comes back from the create request, so the list is not reloaded.
  function handleCreated(order) {
    setOrders((current) => [order, ...current]);
    setCreated(order);
  }

  const newOrderButton = (
    <button type="button" className="button button--primary" onClick={() => setCreating(true)}>
      <Icon name="plus" size={18} />
      New order
    </button>
  );

  let content;
  if (loadError) {
    content = (
      <div className="records__state" role="alert">
        <p className="records__state-title">We couldn’t load your orders</p>
        <p className="records__state-text">{loadError}</p>
        <button type="button" className="button button--secondary button--small" onClick={retry}>
          Try again
        </button>
      </div>
    );
  } else if (!orders) {
    content = (
      <div className="records__state records__state--loading">
        <span className="spinner" aria-hidden="true" />
        <span role="status">Loading orders…</span>
      </div>
    );
  } else if (orders.length === 0) {
    content = (
      <EmptyState
        icon="orders"
        title="No orders yet"
        description="Record an order for one of your customers, and it will be listed here."
      >
        {newOrderButton}
      </EmptyState>
    );
  } else {
    content = <OrderTable orders={orders} labelledBy="orders-list-title" highlightId={created?.id} />;
  }

  return (
    <div className="records">
      <div className="records__header">
        <p className="records__intro">
          Orders recorded for the customers of <strong>{organization.name}</strong>.
        </p>
        {orders && orders.length > 0 && newOrderButton}
      </div>

      <div role="status" className="records__notice">
        {created && (
          <p className="alert alert--success">
            Order for <strong>{created.customerName}</strong> was added.
          </p>
        )}
      </div>

      <div className="records__panel">
        <h2 id="orders-list-title" className="records__panel-title">
          All orders
        </h2>
        {content}
      </div>

      {creating && (
        <NewOrderDialog organizationId={organization.id} onCreated={handleCreated} onClose={() => setCreating(false)} />
      )}
    </div>
  );
}
