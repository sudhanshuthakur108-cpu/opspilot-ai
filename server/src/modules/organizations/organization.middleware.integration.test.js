import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectDatabase, disconnectDatabase, withTransaction } from '../../lib/database.js';
import { createMembershipTestApp } from '../../testing/membershipTestApp.js';
import { User } from '../users/user.model.js';
import { userStore } from '../users/user.store.js';
import { Membership } from './membership.model.js';
import { membershipStore } from './membership.store.js';
import { Organization } from './organization.model.js';
import { organizationStore } from './organization.store.js';
import { createOrganizationWithOwner } from './organization.service.js';

// The membership middleware against MongoDB with the real user and membership stores.
// Runs only when MONGODB_TEST_URI points at a replica set (see organizations.integration.test.js).
const uri = process.env.MONGODB_TEST_URI;

describe.skipIf(!uri)('organization membership middleware against MongoDB', () => {
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

  async function setup() {
    const { app, sessionCookie } = createMembershipTestApp({ users: userStore, memberships: membershipStore });
    const stores = { organizations: organizationStore, memberships: membershipStore, withTransaction };
    const ada = await userStore.create({ email: 'ada@example.com', passwordHash: 'unused' });
    const grace = await userStore.create({ email: 'grace@example.com', passwordHash: 'unused' });
    const acme = await createOrganizationWithOwner(stores, { name: 'Acme', slug: 'acme', ownerUserId: ada.id });
    const globex = await createOrganizationWithOwner(stores, { name: 'Globex', slug: 'globex', ownerUserId: grace.id });
    return { app, ada, acme: acme.organization, globex: globex.organization, adaCookie: await sessionCookie(ada) };
  }

  it('admits a member and attaches the stored membership', async ({ skip }) => {
    if (!transactionsAvailable) skip();
    const { app, ada, acme, adaCookie } = await setup();

    const response = await request(app).get(`/organizations/${acme.id}/probe`).set('Cookie', adaCookie);

    expect(response.status).toBe(200);
    expect(response.body.membership).toEqual({
      id: expect.stringMatching(/^[0-9a-f]{24}$/),
      organizationId: acme.id,
      userId: ada.id,
      role: 'owner',
    });
  });

  it('gives a member of one organization 404 for another, the same as for a missing one', async ({ skip }) => {
    if (!transactionsAvailable) skip();
    const { app, globex, adaCookie } = await setup();

    const other = await request(app).get(`/organizations/${globex.id}/probe`).set('Cookie', adaCookie);
    const missing = await request(app).get(`/organizations/${'f'.repeat(24)}/probe`).set('Cookie', adaCookie);

    expect(other.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(other.body.error.code).toBe('NOT_FOUND');
    expect(other.body.error.message).toBe(missing.body.error.message);
  });

  it('applies role checks to the stored role', async ({ skip }) => {
    if (!transactionsAvailable) skip();
    const { app, ada, globex, adaCookie } = await setup();
    await membershipStore.create({ organizationId: globex.id, userId: ada.id, role: 'member' });

    const asMember = await request(app).post(`/organizations/${globex.id}/managers-only`).set('Cookie', adaCookie);
    await Membership.updateOne({ organizationId: globex.id, userId: ada.id }, { role: 'admin' });
    const asAdmin = await request(app).post(`/organizations/${globex.id}/managers-only`).set('Cookie', adaCookie);

    expect(asMember.status).toBe(403);
    expect(asAdmin.status).toBe(200);
  });
});
