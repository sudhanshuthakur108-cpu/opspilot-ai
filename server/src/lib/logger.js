// Writes one JSON object per line so hosting platforms can parse and search the logs.
// Callers pass only the fields they choose; never pass request headers, bodies or config.
function write(level, message, fields = {}) {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, message, ...fields });

  if (level === 'error') {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  info: (message, fields) => write('info', message, fields),
  error: (message, fields) => write('error', message, fields),
};
