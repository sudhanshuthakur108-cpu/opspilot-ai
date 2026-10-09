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
const TOOL_ICONS = { list_customers: 'customers', list_orders: 'orders', list_tasks: 'tasks' };
const PROVIDER_LABELS = { development: 'Development (no AI model connected)', openai: 'OpenAI' };

// Questions to start from. They only fill in the message; nothing is sent until the person does.
const STARTERS = [
  'Which orders are still pending?',
  'What should my team work on next?',
  'Which customers have open tasks?',
  'Create a follow-up task for the newest pending order',
];

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
const readTools = (tools) => [...new Map(tools.filter((tool) => tool.readOnly).map((tool) => [tool.name, tool])).values()];

function toolList(tools) {
  const reads = readTools(tools);
  return reads.length > 0 ? reads.map(({ name }) => TOOL_LABELS[name] ?? name).join(', ') : 'None';
}

// The records the assistant looked at for this answer.
function RecordsRead({ toolCalls }) {
  const reads = readTools(toolCalls);
  if (reads.length === 0) return null;
  return (
    <ul className="assistant-sources" aria-label="Records the assistant read">
      {reads.map(({ name }) => (
        <li key={name} className="assistant-sources__item">
          <Icon name={TOOL_ICONS[name] ?? 'eye'} size={14} />
          Read {(TOOL_LABELS[name] ?? name).toLowerCase()}
        </li>
      ))}
    </ul>
  );
}

// Changes the assistant proposed in this reply. They are saved as pending approvals, so nothing
// has changed yet; they are reviewed on the Approvals page, not approved from here.
function Proposals({ actions }) {
  const many = actions.length > 1;
  return (
    <div className="assistant-proposals" role="group" aria-labelledby="assistant-proposals-title">
      <div className="assistant-proposals__header">
        <span className="assistant-proposals__icon" aria-hidden="true">
          <Icon name="approvals" size={18} />
        </span>
        <p id="assistant-proposals-title" className="assistant-proposals__title">
          Approval required
        </p>
        <span className="badge badge--warning">Not created yet</span>
      </div>

      <ol className="approval-track" aria-label="What happens next">
        <li className="approval-track__step approval-track__step--done">
          <span className="approval-track__marker" aria-hidden="true">
            <Icon name="check" size={12} />
          </span>
          AI proposal saved
        </li>
        <li className="approval-track__step approval-track__step--current">
          <span className="approval-track__marker" aria-hidden="true" />
          Owner or admin approves
        </li>
        <li className="approval-track__step">
          <span className="approval-track__marker" aria-hidden="true" />
          Change is made
        </li>
      </ol>

      <p className="assistant-proposals__text">
        The assistant proposed {many ? `${actions.length} changes` : 'a change'}. Nothing has been created: an owner or admin
        must approve {many ? 'them' : 'it'} on the Approvals page first.
      </p>
      <ul className="assistant-proposals__list" aria-label="Proposed changes">
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
        <Icon name="arrowRight" size={16} />
      </Link>
    </div>
  );
}

// The latest message and the server's reply to it. Text from the server is rendered as plain
// text, never as HTML.
function Reply({ message, reply }) {
  return (
    <div className="assistant-reply">
      <div className="assistant-message assistant-message--sent">
        <p className="assistant-reply__label">You asked</p>
        <p className="assistant-reply__text">{message}</p>
      </div>

      {reply.status === 'completed' ? (
        <div className="assistant-message assistant-message--answer">
          <div className="assistant-message__header">
            <span className="assistant-message__avatar" aria-hidden="true">
              <Icon name="assistant" size={16} />
            </span>
            <p className="assistant-reply__label">Assistant</p>
          </div>
          <p className="assistant-reply__text">{reply.text}</p>
          <RecordsRead toolCalls={reply.toolCalls} />
        </div>
      ) : (
        <div className="assistant-notice">
          <span className="assistant-notice__icon">
            <Icon name="info" />
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

      <details className="assistant-details-toggle">
        <summary>Response details</summary>
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
      </details>
    </div>
  );
}

function Thinking() {
  return (
    <div className="assistant-thinking">
      <div className="assistant-message__header">
        <span className="assistant-message__avatar" aria-hidden="true">
          <Icon name="assistant" size={16} />
        </span>
        <span className="assistant-thinking__dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span role="status">Waiting for a response…</span>
      </div>
      <span className="skeleton" style={{ width: '82%' }} aria-hidden="true" />
      <span className="skeleton" style={{ width: '64%' }} aria-hidden="true" />
    </div>
  );
}

// What the assistant can and cannot do, so every answer is read in that light.
function Capabilities() {
  return (
    <aside className="assistant-aside" aria-labelledby="assistant-aside-title">
      <h2 id="assistant-aside-title" className="assistant-aside__title">
        How the assistant works
      </h2>
      <dl className="assistant-abilities">
        <div>
          <dt>
            <Icon name="eye" size={16} /> Reads
          </dt>
          <dd>Customers, orders and tasks in this workspace</dd>
        </div>
        <div>
          <dt>
            <Icon name="tasks" size={16} /> Proposes
          </dt>
          <dd>New tasks, saved for an owner or admin to approve</dd>
        </div>
        <div>
          <dt>
            <Icon name="approvals" size={16} /> Never
          </dt>
          <dd>Creates, changes or deletes records on its own</dd>
        </div>
      </dl>
      <p className="assistant-aside__note">
        Only the latest answer is shown, and your messages aren’t saved. Proposals and the decisions on them are kept on
        the{' '}
        <Link className="text-link" href="/approvals">
          Approvals
        </Link>{' '}
        page.
      </p>
    </aside>
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
  const formRef = useRef(null);

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

  // Enter sends; Shift+Enter starts a new line.
  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      formRef.current.requestSubmit();
    }
  }

  function chooseStarter(text) {
    setMessage(text);
    setFieldError('');
    messageRef.current.focus();
  }

  let response;
  if (sending) {
    response = <Thinking />;
  } else if (exchange) {
    response = <Reply message={exchange.message} reply={exchange.reply} />;
  } else {
    response = (
      <EmptyState
        icon="assistant"
        title="Nothing asked yet"
        description="Ask about this workspace’s customers, orders and tasks. The response to your message will appear here; only the latest one is shown, and nothing is saved."
      >
        {STARTERS.map((starter) => (
          <button key={starter} type="button" className="assistant-starter" onClick={() => chooseStarter(starter)}>
            {starter}
          </button>
        ))}
      </EmptyState>
    );
  }

  return (
    <div className="records assistant-page">
      <div className="records__header">
        <p className="records__intro">
          Ask about the customers, orders and tasks of <strong>{organization.name}</strong>. The assistant reads this
          workspace’s records and can propose new tasks, but it can’t change anything: a proposal waits on the Approvals page
          until an owner or admin approves it.
        </p>
      </div>

      <div className="assistant-layout">
        <div className="assistant-main">
          <section className="records__panel assistant-conversation" aria-labelledby="assistant-response-title">
            <h2 id="assistant-response-title" className="records__panel-title">
              Response
            </h2>
            {response}
          </section>

          <form ref={formRef} className="records__panel assistant-form" onSubmit={handleSubmit} noValidate aria-busy={sending}>
            <h2 id="assistant-form-title" className="visually-hidden">
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
                placeholder="Ask about your customers, orders or tasks…"
                multiline
                rows={3}
                value={message}
                onChange={(event) => {
                  setMessage(event.target.value);
                  setFieldError('');
                }}
                onKeyDown={handleKeyDown}
                error={fieldError}
              />
              <div className="assistant-form__actions">
                <p className="assistant-form__keys">
                  <kbd>Enter</kbd> to send · <kbd>Shift</kbd> + <kbd>Enter</kbd> for a new line
                </p>
                <button type="submit" className="button button--primary">
                  {sending ? <span className="spinner" aria-hidden="true" /> : <Icon name="send" size={16} />}
                  {sending ? 'Sending…' : 'Send'}
                </button>
              </div>
            </fieldset>
          </form>
        </div>

        <Capabilities />
      </div>
    </div>
  );
}
