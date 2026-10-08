import '../../styles/records.css';

const createdFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

function NotProvided() {
  return (
    <>
      <span className="records-table__missing" aria-hidden="true">
        —
      </span>
      <span className="visually-hidden">Not provided</span>
    </>
  );
}

// Scrolls sideways inside its own frame on narrow screens, so it is focusable for keyboard users.
export function CustomerTable({ customers, labelledBy, highlightId }) {
  return (
    <div className="records-table" role="region" aria-labelledby={labelledBy} tabIndex={0}>
      <table>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Email</th>
            <th scope="col">Phone</th>
            <th scope="col">Created</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((customer) => (
            <tr key={customer.id} className={customer.id === highlightId ? 'records-table__row--new' : undefined}>
              <th scope="row">
                <span className="records-table__name">
                  <span className="records-table__avatar" aria-hidden="true">
                    {customer.name.charAt(0).toUpperCase()}
                  </span>
                  {customer.name}
                </span>
              </th>
              <td>{customer.email ?? <NotProvided />}</td>
              <td>{customer.phone ?? <NotProvided />}</td>
              <td>
                <time dateTime={customer.createdAt}>{createdFormat.format(new Date(customer.createdAt))}</time>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
