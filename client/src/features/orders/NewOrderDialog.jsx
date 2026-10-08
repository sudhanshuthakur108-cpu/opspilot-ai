import { useEffect, useRef, useState } from 'react';
import { listCustomers } from '../../api/customers.js';
import { describeRequestError } from '../../api/errorMessages.js';
import { createOrder } from '../../api/orders.js';
import { useAuth } from '../../auth/authContext.js';
import { Icon } from '../../components/Icon.jsx';
import { Link } from '../../components/Link.jsx';
import { SelectField, TextField } from '../../components/TextField.jsx';
import { ORDER_STATUSES } from './orderDisplay.js';
import '../../styles/dialog.css';
import './Orders.css';

// Mirrors the server's rules so obvious mistakes are caught before a request is made.
const DESCRIPTION_MAX_LENGTH = 500;
const TOTAL_AMOUNT_MAX = 1_000_000_000_000;
const AMOUNT_FORMAT = /^\d+(\.\d+)?$/;
const CURRENCY_FORMAT = /^[A-Z]{3}$/;
const KNOWN_CURRENCIES = new Set(Intl.supportedValuesOf?.('currency') ?? []);

function decimalPlaces(currency) {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
}

function validate({ customerId, description, totalAmount, currency }) {
  const errors = {};

  if (!customerId) {
    errors.customerId = 'Choose a customer.';
  }

  if (!description.trim()) {
    errors.description = 'Describe the order.';
  } else if (description.trim().length > DESCRIPTION_MAX_LENGTH) {
    errors.description = `Use ${DESCRIPTION_MAX_LENGTH} characters or fewer.`;
  }

  const code = currency.trim().toUpperCase();
  const currencyValid = CURRENCY_FORMAT.test(code) && (KNOWN_CURRENCIES.size === 0 || KNOWN_CURRENCIES.has(code));
  if (!currencyValid) {
    errors.currency = 'Enter a currency code, like INR.';
  }

  const amount = totalAmount.trim();
  if (!amount) {
    errors.totalAmount = 'Enter the total amount.';
  } else if (!AMOUNT_FORMAT.test(amount) || Number(amount) > TOTAL_AMOUNT_MAX) {
    errors.totalAmount = 'Enter an amount like 1250 or 1250.50.';
  } else if (currencyValid) {
    const places = decimalPlaces(code);
    if ((amount.split('.')[1] ?? '').length > places) {
      errors.totalAmount = places === 0 ? `${code} amounts can’t have decimals.` : `Use at most ${places} decimal places.`;
    }
  }

  return errors;
}

const byName = (a, b) => a.name.localeCompare(b.name);

// A modal form for one new order, rendered only while open. It loads the organization's own
// customers to choose from, and always closes through the <dialog> element, so the browser
// returns focus to the button that opened it.
export function NewOrderDialog({ organizationId, onCreated, onClose }) {
  const { endSession } = useAuth();
  const [customers, setCustomers] = useState(null);
  const [customersError, setCustomersError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [values, setValues] = useState({ customerId: '', description: '', status: 'pending', totalAmount: '', currency: 'INR' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef(null);
  const customerRef = useRef(null);
  const descriptionRef = useRef(null);
  const amountRef = useRef(null);
  const currencyRef = useRef(null);
  const customersLinkRef = useRef(null);

  useEffect(() => {
    if (!dialogRef.current.open) dialogRef.current.showModal();
  }, []);

  useEffect(() => {
    let active = true;

    listCustomers(organizationId)
      .then((list) => {
        if (active) setCustomers([...list].sort(byName));
      })
      .catch((error) => {
        if (!active) return;
        if (error.status === 401) {
          endSession();
        } else {
          setCustomersError(describeRequestError(error));
        }
      });

    return () => {
      active = false;
    };
  }, [organizationId, attempt, endSession]);

  // Once customers arrive, start the user where they can act: the first field, or the way to
  // add a customer when there are none.
  useEffect(() => {
    if (customers) (customers.length > 0 ? customerRef : customersLinkRef).current.focus();
  }, [customers]);

  // Runs once the form is enabled again after a failed request.
  useEffect(() => {
    if (formError) customerRef.current.focus();
  }, [formError]);

  function close() {
    dialogRef.current.close();
  }

  function retryCustomers() {
    setCustomersError('');
    setAttempt((count) => count + 1);
  }

  function updateField(event) {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: undefined }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (saving) return;

    const errors = validate(values);
    setFieldErrors(errors);
    setFormError('');
    const firstInvalid = [
      [errors.customerId, customerRef],
      [errors.description, descriptionRef],
      [errors.totalAmount, amountRef],
      [errors.currency, currencyRef],
    ].find(([error]) => error);
    if (firstInvalid) {
      firstInvalid[1].current.focus();
      return;
    }

    setSaving(true);
    try {
      const order = await createOrder(organizationId, {
        customerId: values.customerId,
        description: values.description.trim(),
        status: values.status,
        totalAmount: Number(values.totalAmount.trim()),
        currency: values.currency.trim().toUpperCase(),
      });
      onCreated(order);
      close();
    } catch (error) {
      if (error.status === 401) {
        endSession();
        return;
      }
      if (error.code === 'CUSTOMER_NOT_FOUND') {
        setFieldErrors({ customerId: 'This customer is no longer available. Choose another.' });
        setFormError('Check the order details and try again.');
      } else {
        setFormError(error.status === 400 ? 'Check the order details and try again.' : describeRequestError(error));
      }
      setSaving(false);
    }
  }

  let body;
  let actions;
  if (customersError) {
    body = (
      <div className="dialog__notice" role="alert">
        <p className="dialog__notice-title">We couldn’t load your customers</p>
        <p>{customersError}</p>
      </div>
    );
    actions = (
      <button type="button" className="button button--primary" onClick={retryCustomers}>
        Try again
      </button>
    );
  } else if (!customers) {
    body = (
      <p className="dialog__notice dialog__notice--loading">
        <span className="spinner" aria-hidden="true" />
        <span role="status">Loading customers…</span>
      </p>
    );
  } else if (customers.length === 0) {
    body = (
      <div className="dialog__notice">
        <p className="dialog__notice-title">Add a customer first</p>
        <p>Every order belongs to one of your customers. Add the customer, then come back to record the order.</p>
      </div>
    );
    actions = (
      <Link ref={customersLinkRef} className="button button--primary" href="/customers" onClick={close}>
        Go to Customers
      </Link>
    );
  } else {
    body = (
      <>
        {formError && (
          <p className="alert alert--error" role="alert">
            {formError}
          </p>
        )}
        <fieldset className="dialog__fields" disabled={saving}>
          <SelectField
            ref={customerRef}
            id="order-customer"
            name="customerId"
            label="Customer"
            value={values.customerId}
            onChange={updateField}
            error={fieldErrors.customerId}
          >
            <option value="">Choose a customer</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </SelectField>
          <TextField
            ref={descriptionRef}
            id="order-description"
            name="description"
            label="Description"
            placeholder="Quarterly supplies"
            autoComplete="off"
            value={values.description}
            onChange={updateField}
            error={fieldErrors.description}
          />
          <SelectField id="order-status" name="status" label="Status" value={values.status} onChange={updateField}>
            {ORDER_STATUSES.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
          <div className="order-form__amount">
            <TextField
              ref={amountRef}
              id="order-amount"
              name="totalAmount"
              label="Total amount"
              inputMode="decimal"
              placeholder="0.00"
              autoComplete="off"
              value={values.totalAmount}
              onChange={updateField}
              error={fieldErrors.totalAmount}
            />
            <TextField
              ref={currencyRef}
              id="order-currency"
              name="currency"
              label="Currency"
              maxLength={3}
              autoComplete="off"
              spellCheck={false}
              value={values.currency}
              onChange={updateField}
              error={fieldErrors.currency}
            />
          </div>
        </fieldset>
      </>
    );
    actions = (
      <button type="submit" className="button button--primary" disabled={saving}>
        {saving && <span className="spinner" aria-hidden="true" />}
        {saving ? 'Creating…' : 'Create order'}
      </button>
    );
  }

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      aria-labelledby="new-order-title"
      onCancel={(event) => saving && event.preventDefault()}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} noValidate aria-busy={saving}>
        <div className="dialog__header">
          <div>
            <h2 id="new-order-title" className="dialog__title">
              New order
            </h2>
            <p className="dialog__lead">For one of your organization’s customers.</p>
          </div>
          <button type="button" className="icon-button" aria-label="Close" onClick={close} disabled={saving}>
            <Icon name="close" />
          </button>
        </div>

        {body}

        <div className="dialog__actions">
          <button type="button" className="button button--secondary" onClick={close} disabled={saving}>
            Cancel
          </button>
          {actions}
        </div>
      </form>
    </dialog>
  );
}
