const MONGODB_URI = /mongodb(\+srv)?:\/\/\S+/gi;

// Driver errors can quote the connection string, credentials included.
export function redactConnectionStrings(text) {
  return typeof text === 'string' ? text.replace(MONGODB_URI, 'mongodb://[redacted]') : text;
}
