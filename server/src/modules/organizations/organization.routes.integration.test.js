import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { connectDatabase, disconnectDatabase, withTransaction } from '../../lib/database.js';
import { captureLogger } from '../../testing/captureLogger.js';
import { signUp } from '../../testing/signUp.js';
import { User } from '../users/user.model.js';
import { userStore } from '../users/user.store.js';
import { Membership } from './membership.model.js';
import { membershipStore } from './membership.store.js';
import { Organization } from './organization.model.js';
import { organizationStore } from './organization.store.js';

// The endpoint end to end against MongoDB, with the real user, organization and membership
// stores. Runs only when MONGODB_TEST_URI points at a replica set (see organizations.integration.test.js).
const uri = process.env.MONGODB_TEST_URI;
const ORIGIN = 'http://localhost:5173';
const ACME = { name: 'Acme Logistics', slug: 'acme-logistics' };

function appWith({ memberships = membershipStore } = {}) {
  return createApp({
    logger: captureLogger(),
    clientOrigin: ORIGIN,
    auth: { users: userStore, secret: 'test-secret-that-is-at-least-32-chars', secureCookie: false },
    organizationStores: { organizations: organizationStore, memberships, withTransaction },
  });
}

function createOrganization(app, cookie, body) {
  return request(app).post('/api/v1/organizations').set('Origin', ORIGIN).set('Cookie', cookie).send(body);
}

describe.skipIf(!uri)('POST /api/v1/organizations against MongoDB', () => {
  let transactionsAvailable = false;

  beforeAll(async () => {
    await connectDatabase(uri, { dbName: `opspilot_test_${randomBytes(6).toString('hex')}` });
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    transactionsAvailable = Boolean(hello.setName) || hello.msg === 'isdbgrid';
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectDatabase();
  });

  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), Organization.deleteMany({}), Membership.deleteMany({})]);
  });

  it('creates exactly one organization and one owner membership for the signed-in user', async ({ skip }) => {
    if (!transactionsAvailable) skip();
    const app = appWith();
    const { user, cookie } = await signUp(app, { origin: ORIGIN });

    const response = await createOrganization(app, cookie, ACME);

    expect(response.status).toBe(201);
    expect(await Organization.countDocuments()).toBe(1);
    const memberships = await Membership.find().lean();
    expect(memberships).toHaveLength(1);
    expect(memberships[0]).toMatchObject({ role: 'owner' });
    expect(memberships[0].userId.toString()).toBe(user.id);
    expect(memberships[0].organizationId.toString()).toBe(response.body.organization.id);
  });

  it('returns 409 for a taken slug and leaves the existing data alone', async ({ skip }) => {
    if (!transactionsAvailable) skip();
    const app = appWith();
    const first = await signUp(app, { origin: ORIGIN });
    const second = await signUp(app, { origin: ORIGIN, email: 'grace@example.com' });
    await createOrganization(app, first.cookie, ACME);

    const response = await createOrganization(app, second.cookie, { name: 'Another', slug: ACME.slug });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('SLUG_UNAVAILABLE');
    expect(await Organization.countDocuments()).toBe(1);
    expect(await Membership.countDocuments()).toBe(1);
  });

  it('rolls back the organization when the membership write fails', async ({ skip }) => {
    if (!transactionsAvailable) skip();
    const failingMemberships = {
      create: async () => {
        throw new Error('simulated membership failure');
      },
    };
    const app = appWith({ memberships: failingMemberships });
    const { cookie } = await signUp(app, { origin: ORIGIN });

    const response = await createOrganization(app, cookie, ACME);

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(await Organization.countDocuments()).toBe(0);
    expect(await Membership.countDocuments()).toBe(0);
  });
});
