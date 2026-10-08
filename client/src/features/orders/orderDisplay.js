// The statuses the server accepts, in the order a user would pick them.
export const ORDER_STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const STATUS_LABELS = Object.fromEntries(ORDER_STATUSES.map(({ value, label }) => [value, label]));

export function statusLabel(status) {
  return STATUS_LABELS[status] ?? status;
}

// The amount in the order's own currency, such as "₹1,250.50". A currency code the browser
// does not recognize is shown as plain text rather than breaking the page.
export function formatAmount(amount, currency) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}
