import { useEffect, useRef, useState } from 'react';
import { askAssistant } from '../../api/ai.js';
import { describeRequestError } from '../../api/errorMessages.js';
import { useAuth } from '../../auth/authContext.js';
import { EmptyState } from '../../components/EmptyState.jsx';
import { Icon } from '../../components/Icon.jsx';
import { Link } from '../../components/Link.jsx';
import { TextField } from '../../components/TextField.jsx';
import { actionLabel } from '../approvals/approvalDisplay.js';
import '../../styles/records.css';
import './Assistant.css';

// Mirrors the server's rule so an empty or oversized message is caught before a request is made.
const MESSAGE_MAX_LENGTH = 2000;

const TOOL_LABELS = { list_customers: 'Customers', list_orders: 'Orders', list_tasks: 'Tasks' };
const PROVIDER_LABELS = { development: 'Development (no AI model connected)', openai: 'OpenAI' };

function validate(message) {
  if (!message.trim()) return 'Enter a message.';
  if (message.trim().length > MESSAGE_MAX_LENGTH) return `Use ${MESSAGE_MAX_LENGTH} characters or fewer.`;
  return '';
}

function describeAssistantError(error) {
  if (error.status === 400) return 'Check your message and try again.';
  if (error.code === 'AI_PROVIDER_ERROR') return 'The assistant couldn’t produce a reply. Please try again.';
  if (error.code === 'AI_PROVIDER_UNAVAILABLE') return 'The assistant is busy or took too long to answer. Please try again in a moment.';
  return describeRequestError(error);
}

// Each read-only tool once, even if the assistant used it more than once. Proposals are listed
// separately, as they are not data the assistant read.
function toolList(tools) {
  const reads = tools.filter((tool) => tool.readOnly);
  return reads.length > 0 ? [...new Set(reads.map(({ name }) => TOOL_LABELS[name] ?? name))].join(', ') : 'None';
}

// Changes the assistant proposed in this reply. They are saved as pending approvals, so nothing
// has changed yet; they are reviewed on the Approvals page, not approved from here.
function Proposals({ actions }) {
  const many = actions.length > 1;
  return (
    <div className="assistant-proposals" role="group" aria-labelledby="assistant-proposals-title">
      <div className="assistant-proposals__header">
        <p id="assistant-proposals-title" className="assistant-proposals__title">
          Approval required
        </p>
        <span className="assistant-proposals__badge">Not created yet</span>
      </div>
      <p className="assistant-proposals__text">
        The assistant proposed {many ? `${actions.length} changes` : 'a change'}. Nothing has been created: an owner or admin
        must approve {many ? 'them' : 'it'} on the Approvals page first.
      </p>
      <ul className="assistant-proposals__list">
        {actions.map((action) => (
          <li key={action.approvalId} className="assistant-proposals__item">
            <span className="assistant-proposals__action">
              {actionLabel(action.action)}: {action.parameters?.title ?? action.summary}
            </span>
            <span className="assistant-proposals__summary">{action.summary}</span>
          </li>
        ))}
      </ul>
      <Link className="button button--primary button--small assistant-proposals__link" href="/approvals">
        {many ? 'Review approvals' : 'Review approval'}
      </Link>
    </div>
  );
}

// The latest message and the server's reply to it. Text from the server is rendered as plain
// text, never as HTML.
function Reply({ message, reply }) {
  return (
    <div className="assistant-reply">
      <div className="assistant-reply__block assistant-reply__block--sent">
        <p className="assistant-reply__label">You asked</p>
        <p className="assistant-reply__text">{message}</p>
      </div>

      {reply.status === 'completed' ? (
        <div className="assistant-reply__block">
          <p className="assistant-reply__label">Assistant</p>
          <p className="assistant-reply__text">{reply.text}</p>
        </div>
      ) : (
        <div className="assistant-notice">
          <span className="assistant-notice__icon">
            <Icon name="assistant" />
          </span>
          <div>
            <p className="assistant-notice__title">No answer was generated</p>
            <p className="assistant-notice__text">
              No AI model is connected yet, so your message wasn’t sent to one. The server checked the message and
              confirmed you can use the assistant in this workspace.
            </p>
          </div>
        </div>
      )}

      {reply.suggestedActions.length > 0 && <Proposals actions={reply.suggestedActions} />}

      <dl className="assistant-details">
        <div>
          <dt>Provider</dt>
          <dd>{PROVIDER_LABELS[reply.provider] ?? reply.provider}</dd>
        </div>
        <div>
          <dt>Records read</dt>
          <dd>{toolList(reply.toolCalls)}</dd>
        </div>
        <div>
          <dt>Can read</dt>
          <dd>{toolList(reply.availableTools)}</dd>
        </div>
        <div>
          <dt>Suggested changes</dt>
          <dd>{reply.suggestedActions.length > 0 ? reply.suggestedActions.length : 'None'}</dd>
        </div>
        <div>
          <dt>Needs approval</dt>
          <dd>{reply.requiresApproval ? 'Yes' : 'No'}</dd>
        </div>
        <div>
          <dt>Request ID</dt>
          <dd className="assistant-details__id">{reply.requestId}</dd>
        </div>
      </dl>
    </div>
  );
}

export function AssistantPage({ organization }) {
  const { endSession } = useAuth();
  const [message, setMessage] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [requestError, setRequestError] = useState('');
  const [sending, setSending] = useState(false);
  const [exchange, setExchange] = useState(null);
  const messageRef = useRef(null);

  // Runs once the form is enabled again after a failed request.
  useEffect(() => {
    if (requestError) messageRef.current.focus();
  }, [requestError]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (sending) return;

    const error = validate(message);
    setFieldError(error);
    setRequestError('');
    if (error) {
      messageRef.current.focus();
      return;
    }

    const sent = message.trim();
    setSending(true);
    try {
      const reply = await askAssistant(organization.id, sent);
      setExchange({ message: sent, reply });
      setMessage('');
      setSending(false);
    } catch (failure) {
      if (failure.status === 401) {
        endSession();
        return;
      }
      setRequestError(describeAssistantError(failure));
      setSending(false);
    }
  }

  let response;
  if (sending) {
    response = (
      <div className="records__state records__state--loading">
        <span className="spinner" aria-hidden="true" />
        <span role="status">Waiting for a response…</span>
      </div>
    );
  } else if (exchange) {
    response = <Reply message={exchange.message} reply={exchange.reply} />;
  } else {
    response = (
      <EmptyState
        icon="assistant"
        title="Nothing asked yet"
        description="The response to your message will appear here. Only the latest one is shown, and nothing is saved."
      />
    );
  }

  return (
    <div className="records">
      <div className="records__header">
        <p className="records__intro">
          Ask about the customers, orders and tasks of <strong>{organization.name}</strong>. The assistant reads this
          workspace’s records and can propose new tasks, but it can’t change anything: a proposal waits on the Approvals page
          until an owner or admin approves it.
        </p>
      </div>

      <form className="records__panel assistant-form" onSubmit={handleSubmit} noValidate aria-busy={sending}>
        <h2 id="assistant-form-title" className="records__panel-title">
          Ask the assistant
        </h2>
        {requestError && (
          <p className="alert alert--error" role="alert">
            {requestError}
          </p>
        )}
        <fieldset className="assistant-form__fields" disabled={sending} aria-labelledby="assistant-form-title">
          <TextField
            ref={messageRef}
            id="assistant-message"
            name="message"
            label="Message"
            hint={`Up to ${MESSAGE_MAX_LENGTH} characters.`}
            placeholder="Which orders are still pending?"
            multiline
            rows={4}
            value={message}
            onChange={(event) => {
              setMessage(event.target.value);
              setFieldError('');
            }}
            error={fieldError}
          />
          <div className="assistant-form__actions">
            <button type="submit" className="button button--primary">
              {sending && <span className="spinner" aria-hidden="true" />}
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </fieldset>
      </form>

      <section className="records__panel" aria-labelledby="assistant-response-title">
        <h2 id="assistant-response-title" className="records__panel-title">
          Response
        </h2>
        {response}
      </section>
    </div>
  );
}
