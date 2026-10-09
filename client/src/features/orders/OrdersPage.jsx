import { useEffect, useState } from 'react';
import { describeRequestError } from '../../api/errorMessages.js';
import { listOrders } from '../../api/orders.js';
import { useAuth } from '../../auth/authContext.js';
import { EmptyState } from '../../components/EmptyState.jsx';
import { Icon } from '../../components/Icon.jsx';
import { ListFilter, LoadFailure, LoadingRows, matchesQuery } from '../../components/RecordStates.jsx';
import { NewOrderDialog } from './NewOrderDialog.jsx';
import { OrderTable } from './OrderTable.jsx';
import { statusLabel } from './orderDisplay.js';
import '../../styles/records.css';

export function OrdersPage({ organization }) {
  const { endSession } = useAuth();
  const [orders, setOrders] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null);
  const [query, setQuery] = useState('');

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

  const shown = orders?.filter((order) => matchesQuery(query, order.customerName, order.description, statusLabel(order.status))) ?? [];

  let content;
  if (loadError) {
    content = <LoadFailure title="We couldn’t load your orders" message={loadError} onRetry={retry} />;
  } else if (!orders) {
    content = <LoadingRows label="Loading orders…" />;
  } else if (orders.length === 0) {
    content = (
      <EmptyState
        icon="orders"
        title="No orders yet"
        description="Record what a customer has ordered to track its status and amount. Every order belongs to one of your customers."
      >
        {newOrderButton}
      </EmptyState>
    );
  } else if (shown.length === 0) {
    content = <p className="records__no-match">No orders match “{query.trim()}”.</p>;
  } else {
    content = <OrderTable orders={shown} labelledBy="orders-list-title" highlightId={created?.id} />;
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
        <div className="records__panel-header">
          <div className="records__panel-title">
            <h2 id="orders-list-title">All orders</h2>
            {orders && orders.length > 0 && <span className="records__count">{orders.length}</span>}
          </div>
          {orders && orders.length > 0 && (
            <ListFilter id="orders-filter" label="Filter orders" placeholder="Filter orders" value={query} onChange={setQuery} />
          )}
        </div>
        {content}
      </div>

      {creating && (
        <NewOrderDialog organizationId={organization.id} onCreated={handleCreated} onClose={() => setCreating(false)} />
      )}
    </div>
  );
}
