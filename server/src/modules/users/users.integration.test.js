import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { connectDatabase, disconnectDatabase } from '../../lib/database.js';
import { captureLogger } from '../../testing/captureLogger.js';
import { hashPassword } from '../auth/password.js';
import { User } from './user.model.js';
import { userStore } from './user.store.js';

// Account names against MongoDB, with the real user store. Runs only when MONGODB_TEST_URI is set
// (see organizations.integration.test.js); each run uses its own throwaway database.
const uri = process.env.MONGODB_TEST_URI;
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct horse battery';

describe.skipIf(!uri)('account names against MongoDB', () => {
  let app;

  beforeAll(async () => {
    await connectDatabase(uri, { dbName: `opspilot_test_${randomBytes(6).toString('hex')}` });
    app = createApp({
      logger: captureLogger(),
      clientOrigin: ORIGIN,
      auth: { users: userStore, secret: 'test-secret-that-is-at-least-32-chars', secureCookie: false },
    });
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectDatabase();
  });

  beforeEach(async () => {
    await User.deleteMany({});
  });

  const post = (path, body) => request(app).post(`/api/v1/auth/${path}`).set('Origin', ORIGIN).send(body);
  const cookieOf = (response) => response.headers['set-cookie'][0].split(';')[0];

  it('stores the name given at registration and returns it from /me', async () => {
    const registered = await post('register', { name: '  Sudhanshu   Thakur ', email: 'sudhanshu@example.com', password: PASSWORD });

    const me = await request(app).get('/api/v1/auth/me').set('Cookie', cookieOf(registered));

    expect(registered.status).toBe(201);
    expect((await User.findOne({ email: 'sudhanshu@example.com' }).lean()).name).toBe('Sudhanshu Thakur');
    expect(me.body.user).toEqual({ id: registered.body.user.id, email: 'sudhanshu@example.com', name: 'Sudhanshu Thakur', createdAt: expect.any(String) });
  });

  it('signs in an account created before names existed, without giving it one', async () => {
    await User.collection.insertOne({
      email: 'legacy@example.com',
      passwordHash: await hashPassword(PASSWORD),
      tokenVersion: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const login = await post('login', { email: 'legacy@example.com', password: PASSWORD });
    const me = await request(app).get('/api/v1/auth/me').set('Cookie', cookieOf(login));

    expect(login.status).toBe(200);
    expect(login.body.user.name).toBeNull();
    expect(me.body.user.name).toBeNull();
    expect(await User.collection.findOne({ email: 'legacy@example.com' })).not.toHaveProperty('name');
  });

  it('saves a changed name for the signed-in user only', async () => {
    const ada = await post('register', { name: 'Ada Lovelace', email: 'ada@example.com', password: PASSWORD });
    await post('register', { name: 'Grace Hopper', email: 'grace@example.com', password: PASSWORD });

    const response = await request(app)
      .patch('/api/v1/auth/me')
      .set('Origin', ORIGIN)
      .set('Cookie', cookieOf(ada))
      .send({ name: '  Ada   King ' });

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({ ...ada.body.user, name: 'Ada King' });
    expect((await User.findOne({ email: 'ada@example.com' }).lean()).name).toBe('Ada King');
    expect((await User.findOne({ email: 'grace@example.com' }).lean()).name).toBe('Grace Hopper');
  });

  it('lets an account created before names existed set one', async () => {
    await User.collection.insertOne({
      email: 'legacy@example.com',
      passwordHash: await hashPassword(PASSWORD),
      tokenVersion: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const login = await post('login', { email: 'legacy@example.com', password: PASSWORD });

    const response = await request(app)
      .patch('/api/v1/auth/me')
      .set('Origin', ORIGIN)
      .set('Cookie', cookieOf(login))
      .send({ name: 'Legacy Person' });
    const me = await request(app).get('/api/v1/auth/me').set('Cookie', cookieOf(login));

    expect(response.status).toBe(200);
    expect((await User.collection.findOne({ email: 'legacy@example.com' })).name).toBe('Legacy Person');
    expect(me.body.user.name).toBe('Legacy Person');
  });
});
