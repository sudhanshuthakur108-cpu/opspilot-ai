import { useEffect, useRef, useState } from 'react';
import { listCustomers } from '../../api/customers.js';
import { describeRequestError } from '../../api/errorMessages.js';
import { listOrders } from '../../api/orders.js';
import { createTask } from '../../api/tasks.js';
import { useAuth } from '../../auth/authContext.js';
import { Icon } from '../../components/Icon.jsx';
import { SelectField, TextField } from '../../components/TextField.jsx';
import { TASK_PRIORITIES, TASK_STATUSES } from './taskDisplay.js';
import '../../styles/dialog.css';
import './Tasks.css';

// Mirrors the server's rules so obvious mistakes are caught before a request is made.
const TITLE_MAX_LENGTH = 200;
const DESCRIPTION_MAX_LENGTH = 2000;
const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

function validate({ title, description, dueDate }) {
  const errors = {};

  if (!title.trim()) {
    errors.title = 'Give the task a title.';
  } else if (title.trim().length > TITLE_MAX_LENGTH) {
    errors.title = `Use ${TITLE_MAX_LENGTH} characters or fewer.`;
  }

  if (description.trim().length > DESCRIPTION_MAX_LENGTH) {
    errors.description = `Use ${DESCRIPTION_MAX_LENGTH} characters or fewer.`;
  }

  if (dueDate && !DATE_FORMAT.test(dueDate)) {
    errors.dueDate = 'Enter a valid date.';
  }

  return errors;
}

function optionalLabel(text) {
  return (
    <>
      {text} <span className="dialog__optional">Optional</span>
    </>
  );
}

const EMPTY_TASK = { title: '', description: '', customerId: '', orderId: '', priority: 'medium', status: 'todo', dueDate: '' };
const byName = (a, b) => a.name.localeCompare(b.name);

// A modal form for one new task, rendered only while open. The optional customer and order are
// chosen from the organization's own records, loaded from its customers and orders APIs. It
// always closes through the <dialog> element, so the browser returns focus to the button that
// opened it.
export function NewTaskDialog({ organizationId, onCreated, onClose }) {
  const { endSession } = useAuth();
  const [values, setValues] = useState(EMPTY_TASK);
  const [customers, setCustomers] = useState(null);
  const [orders, setOrders] = useState(null);
  const [linksError, setLinksError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef(null);
  const titleRef = useRef(null);
  const descriptionRef = useRef(null);
  const dueDateRef = useRef(null);

  useEffect(() => {
    if (!dialogRef.current.open) dialogRef.current.showModal();
    titleRef.current.focus();
  }, []);

  useEffect(() => {
    let active = true;

    Promise.all([listCustomers(organizationId), listOrders(organizationId)])
      .then(([customerList, orderList]) => {
        if (!active) return;
        setCustomers([...customerList].sort(byName));
        setOrders(orderList);
      })
      .catch((error) => {
        if (!active) return;
        if (error.status === 401) {
          endSession();
        } else {
          setLinksError(describeRequestError(error));
        }
      });

    return () => {
      active = false;
    };
  }, [organizationId, attempt, endSession]);

  // Runs once the form is enabled again after a failed request.
  useEffect(() => {
    if (formError) titleRef.current.focus();
  }, [formError]);

  function close() {
    dialogRef.current.close();
  }

  function retryLinks() {
    setLinksError('');
    setAttempt((count) => count + 1);
  }

  function updateField(event) {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: undefined }));
  }

  // A chosen order brings its customer with it; choosing another customer drops an order that
  // is not theirs. The server refuses an order of a different customer.
  function chooseCustomer(event) {
    const customerId = event.target.value;
    setValues((current) => {
      const order = orders.find((candidate) => candidate.id === current.orderId);
      const keepOrder = order && (!customerId || order.customerId === customerId);
      return { ...current, customerId, orderId: keepOrder ? current.orderId : '' };
    });
    setFieldErrors((current) => ({ ...current, customerId: undefined, orderId: undefined }));
  }

  function chooseOrder(event) {
    const orderId = event.target.value;
    const order = orders.find((candidate) => candidate.id === orderId);
    setValues((current) => ({ ...current, orderId, customerId: order ? order.customerId : current.customerId }));
    setFieldErrors((current) => ({ ...current, customerId: undefined, orderId: undefined }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (saving) return;

    const errors = validate(values);
    setFieldErrors(errors);
    setFormError('');
    const firstInvalid = [
      [errors.title, titleRef],
      [errors.description, descriptionRef],
      [errors.dueDate, dueDateRef],
    ].find(([error]) => error);
    if (firstInvalid) {
      firstInvalid[1].current.focus();
      return;
    }

    setSaving(true);
    try {
      const task = await createTask(organizationId, {
        title: values.title.trim(),
        description: values.description.trim() || undefined,
        status: values.status,
        priority: values.priority,
        customerId: values.customerId || undefined,
        orderId: values.orderId || undefined,
        dueDate: values.dueDate || undefined,
      });
      onCreated(task);
      close();
    } catch (error) {
      if (error.status === 401) {
        endSession();
        return;
      }
      if (error.code === 'CUSTOMER_NOT_FOUND') {
        setFieldErrors({ customerId: 'This customer is no longer available. Choose another.' });
      } else if (error.code === 'ORDER_NOT_FOUND') {
        setFieldErrors({ orderId: 'This order is no longer available. Choose another.' });
      }
      const detailsProblem = error.status === 400 || error.code === 'CUSTOMER_NOT_FOUND' || error.code === 'ORDER_NOT_FOUND';
      setFormError(detailsProblem ? 'Check the task details and try again.' : describeRequestError(error));
      setSaving(false);
    }
  }

  const linksLoading = !linksError && (!customers || !orders);
  const linksReady = Boolean(customers && orders);
  const visibleOrders = linksReady && values.customerId ? orders.filter((order) => order.customerId === values.customerId) : orders ?? [];

  let orderHint;
  if (linksLoading) orderHint = 'Loading orders…';
  else if (linksReady && visibleOrders.length === 0) orderHint = values.customerId ? 'This customer has no orders.' : 'No orders yet.';

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      aria-labelledby="new-task-title"
      onCancel={(event) => saving && event.preventDefault()}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} noValidate aria-busy={saving}>
        <div className="dialog__header">
          <div>
            <h2 id="new-task-title" className="dialog__title">
              New task
            </h2>
            <p className="dialog__lead">Link it to a customer or order if it’s for one.</p>
          </div>
          <button type="button" className="icon-button" aria-label="Close" onClick={close} disabled={saving}>
            <Icon name="close" />
          </button>
        </div>

        {formError && (
          <p className="alert alert--error" role="alert">
            {formError}
          </p>
        )}
        {linksError && (
          <div className="alert alert--error task-form__links-error" role="alert">
            <span>We couldn’t load your customers and orders. You can still create the task without them.</span>
            <button type="button" className="link-button" onClick={retryLinks}>
              Try again
            </button>
          </div>
        )}

        <fieldset className="dialog__fields" disabled={saving}>
          <TextField
            ref={titleRef}
            id="task-title"
            name="title"
            label="Title"
            placeholder="Confirm the delivery date"
            autoComplete="off"
            value={values.title}
            onChange={updateField}
            error={fieldErrors.title}
          />
          <TextField
            ref={descriptionRef}
            id="task-description"
            name="description"
            label={optionalLabel('Description')}
            multiline
            rows={3}
            value={values.description}
            onChange={updateField}
            error={fieldErrors.description}
          />
          <SelectField
            id="task-customer"
            name="customerId"
            label={optionalLabel('Customer')}
            value={values.customerId}
            onChange={chooseCustomer}
            disabled={!linksReady}
            hint={linksLoading ? 'Loading customers…' : undefined}
            error={fieldErrors.customerId}
          >
            <option value="">No customer</option>
            {(customers ?? []).map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            id="task-order"
            name="orderId"
            label={optionalLabel('Order')}
            value={values.orderId}
            onChange={chooseOrder}
            disabled={!linksReady}
            hint={orderHint}
            error={fieldErrors.orderId}
          >
            <option value="">No order</option>
            {visibleOrders.map((order) => (
              <option key={order.id} value={order.id}>
                {order.description} — {order.customerName}
              </option>
            ))}
          </SelectField>
          <div className="task-form__row">
            <SelectField id="task-priority" name="priority" label="Priority" value={values.priority} onChange={updateField}>
              {TASK_PRIORITIES.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectField>
            <SelectField id="task-status" name="status" label="Status" value={values.status} onChange={updateField}>
              {TASK_STATUSES.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectField>
          </div>
          <TextField
            ref={dueDateRef}
            id="task-due-date"
            name="dueDate"
            type="date"
            label={optionalLabel('Due date')}
            value={values.dueDate}
            onChange={updateField}
            error={fieldErrors.dueDate}
          />
        </fieldset>

        <div className="dialog__actions">
          <button type="button" className="button button--secondary" onClick={close} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="button button--primary" disabled={saving}>
            {saving && <span className="spinner" aria-hidden="true" />}
            {saving ? 'Creating…' : 'Create task'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
