import { describe, expect, it } from 'vitest';
import { redactConnectionStrings } from './redact.js';

describe('redactConnectionStrings', () => {
  it.each([
    'failed to connect to mongodb://app-user:pw-secret@db.example.com:27017/opspilot',
    'failed to connect to mongodb+srv://app-user:pw-secret@cluster0.example.mongodb.net/opspilot (timeout)',
    'Error: bad URI "MONGODB://app-user:pw-secret@db.example.com"\n    at connect (database.js:1:1)',
  ])('removes connection strings from %s', (text) => {
    const redacted = redactConnectionStrings(text);

    expect(redacted).toContain('mongodb://[redacted]');
    expect(redacted).not.toMatch(/pw-secret|app-user|example\.com/);
  });

  it('leaves other text and non-strings alone', () => {
    expect(redactConnectionStrings('connection refused')).toBe('connection refused');
    expect(redactConnectionStrings(undefined)).toBeUndefined();
  });
});
