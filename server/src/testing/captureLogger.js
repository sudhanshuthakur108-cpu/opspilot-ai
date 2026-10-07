// Logger stand-in for tests: records entries instead of printing them.
export function captureLogger() {
  const entries = [];

  return {
    entries,
    info: (message, fields) => entries.push({ level: 'info', message, ...fields }),
    error: (message, fields) => entries.push({ level: 'error', message, ...fields }),
  };
}
