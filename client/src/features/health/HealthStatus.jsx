import { useEffect, useState } from 'react';
import { fetchHealth } from '../../api/health.js';
import './HealthStatus.css';

const LABELS = {
  loading: 'Checking…',
  ok: 'Healthy',
  error: 'Unavailable',
};

export default function HealthStatus() {
  const [health, setHealth] = useState({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    fetchHealth({ signal: controller.signal })
      .then(() => {
        if (!controller.signal.aborted) setHealth({ state: 'ok' });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setHealth({ state: 'error', message: error.message });
      });

    return () => controller.abort();
  }, [attempt]);

  function checkAgain() {
    setHealth({ state: 'loading' });
    setAttempt((count) => count + 1);
  }

  return (
    <section className="health" aria-labelledby="health-heading">
      <h2 id="health-heading">API status</h2>

      <p className={`health__status health__status--${health.state}`} role="status">
        <span className="health__dot" aria-hidden="true" />
        {LABELS[health.state]}
      </p>

      {health.state === 'error' && (
        <>
          <p className="health__detail">{health.message}</p>
          <button type="button" className="button" onClick={checkAgain}>
            Check again
          </button>
        </>
      )}
    </section>
  );
}
