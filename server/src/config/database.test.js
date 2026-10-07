import { describe, expect, it } from 'vitest';
import { readDatabaseConfig } from './database.js';

describe('readDatabaseConfig', () => {
  it.each(['development', 'test'])('allows running without a database in %s', (nodeEnv) => {
    expect(readDatabaseConfig({}, nodeEnv)).toEqual({ database: { uri: null }, errors: [] });
  });

  it('requires MONGODB_URI in production', () => {
    const { errors } = readDatabaseConfig({ MONGODB_URI: '' }, 'production');

    expect(errors).toEqual(['MONGODB_URI is required when NODE_ENV is production']);
  });

  it.each([
    'mongodb://127.0.0.1:27017/opspilot',
    'mongodb://app-user:example-password@db1.example.com:27017,db2.example.com:27017/opspilot?replicaSet=rs0',
    'mongodb+srv://app-user:example-password@cluster0.example.mongodb.net/opspilot',
  ])('accepts %s', (uri) => {
    expect(readDatabaseConfig({ MONGODB_URI: uri }, 'production')).toEqual({ database: { uri }, errors: [] });
  });

  it.each([
    'postgres://app-user:pw-secret@db.example.com/opspilot',
    'mongodb://',
    'mongodb://app-user:pw-secret@db.example.com/opspilot with spaces',
    'pw-secret',
  ])('rejects a malformed URI without repeating it', (uri) => {
    const { errors } = readDatabaseConfig({ MONGODB_URI: uri }, 'development');

    expect(errors).toEqual(['MONGODB_URI must be a connection string starting with mongodb:// or mongodb+srv://']);
    expect(errors.join()).not.toContain('pw-secret');
  });
});
