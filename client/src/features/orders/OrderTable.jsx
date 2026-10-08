import { formatAmount, statusLabel } from './orderDisplay.js';
import '../../styles/records.css';
import './Orders.css';

const createdFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

// Scrolls sideways inside its own frame on narrow screens, so it is focusable for keyboard users.
export function OrderTable({ orders, labelledBy, highlightId }) {
  return (
    <div className="records-table" role="region" aria-labelledby={labelledBy} tabIndex={0}>
      <table>
        <thead>
          <tr>
            <th scope="col">Customer</th>
            <th scope="col">Description</th>
            <th scope="col">Status</th>
            <th scope="col" className="order-table__amount">
              Amount
            </th>
            <th scope="col">Created</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} className={order.id === highlightId ? 'records-table__row--new' : undefined}>
              <th scope="row">{order.customerName ?? 'Unknown customer'}</th>
              <td className="order-table__description">{order.description}</td>
              <td>
                <span className={`order-status order-status--${order.status}`}>{statusLabel(order.status)}</span>
              </td>
              <td className="order-table__amount">{formatAmount(order.totalAmount, order.currency)}</td>
              <td>
                <time dateTime={order.createdAt}>{createdFormat.format(new Date(order.createdAt))}</time>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
