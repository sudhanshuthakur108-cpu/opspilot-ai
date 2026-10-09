import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { connectDatabase, disconnectDatabase, withTransaction } from '../../lib/database.js';
import { captureLogger } from '../../testing/captureLogger.js';
import { signUp } from '../../testing/signUp.js';
import { Membership } from '../organizations/membership.model.js';
import { membershipStore } from '../organizations/membership.store.js';
import { Organization } from '../organizations/organization.model.js';
import { organizationStore } from '../organizations/organization.store.js';
import { User } from '../users/user.model.js';
import { userStore } from '../users/user.store.js';
import { AuditLog } from './audit.model.js';
import { auditLogStore } from './audit.store.js';

// Organization settings and the audit log end to end against MongoDB, with the real stores. Runs
// only when MONGODB_TEST_URI points at a replica set (see organizations.integration.test.js).
const uri = process.env.MONGODB_TEST_URI;
const ORIGIN = 'http://localhost:5173';

describe.skipIf(!uri)('organization settings and audit logs against MongoDB', () => {
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
    await Promise.all([User, Organization, Membership, AuditLog].map((model) => model.deleteMany({})));
  });

  // Ada owns Acme and Grace owns Globex.
  async function setup({ auditLogs = auditLogStore } = {}) {
    const app = createApp({
      logger: captureLogger(),
      clientOrigin: ORIGIN,
      auth: { users: userStore, secret: 'test-secret-that-is-at-least-32-chars', secureCookie: false },
      organizationStores: { organizations: organizationStore, memberships: membershipStore, withTransaction },
      auditLogs,
    });

    async function ownerOf(email, name, slug) {
      const { user, cookie } = await signUp(app, { origin: ORIGIN, email });
      const created = await request(app).post('/api/v1/organizations').set('Origin', ORIGIN).set('Cookie', cookie).send({ name, slug });
      return { user, cookie, organizationId: created.body.organization.id };
    }

    return { app, ada: await ownerOf('ada@example.com', 'Acme', 'acme'), grace: await ownerOf('grace@example.com', 'Globex', 'globex') };
  }

  const rename = (app, organizationId, cookie, name) =>
    request(app).patch(`/api/v1/organizations/${organizationId}`).set('Origin', ORIGIN).set('Cookie', cookie).send({ name });
  const list = (app, organizationId, cookie, query = '') =>
    request(app).get(`/api/v1/organizations/${organizationId}/audit-logs${query}`).set('Cookie', cookie);

  it('renames the organization and stores one audit entry for it in the same organization', async ({ skip }) => {
    if (!transactionsAvailable) skip();
    const { app, ada } = await setup();

    const response = await rename(app, ada.organizationId, ada.cookie, '  Acme Logistics  ');

    expect(response.status).toBe(200);
    expect(response.body.organization).toMatchObject({ id: ada.organizationId, name: 'Acme Logistics', slug: 'acme' });
    expect((await Organization.findById(ada.organizationId).lean()).name).toBe('Acme Logistics');

    const entries = await AuditLog.find().lean();
    expect(entries).toHaveLength(1);
    const [entry] = entries;
    expect(entry).toMatchObject({
      actorType: 'user',
      action: 'organization.updated',
      resourceType: 'organization',
      details: { previousName: 'Acme', name: 'Acme Logistics' },
    });
    expect(entry.organizationId).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(entry.organizationId.toString()).toBe(ada.organizationId);
    expect(entry.actorUserId.toString()).toBe(ada.user.id);
    expect(entry.resourceId.toString()).toBe(ada.organizationId);
    expect(entry.createdAt).toBeInstanceOf(Date);
    expect(entry).not.toHaveProperty('updatedAt');
  });

  it('returns the stored entries newest first, with the actor’s email and no internal fields', async ({ skip }) => {
    if (!transactionsAvailable) skip();
    const { app, ada } = await setup();
    await rename(app, ada.organizationId, ada.cookie, 'Second');
    await rename(app, ada.organizationId, ada.cookie, 'Third');

    const response = await list(app, ada.organizationId, ada.cookie);

    expect(response.status).toBe(200);
    expect(response.body.auditLogs.map((entry) => entry.details)).toEqual([
      { previousName: 'Second', name: 'Third' },
      { previousName: 'Acme', name: 'Second' },
    ]);
    expect(response.body.auditLogs[0]).toMatchObject({ actorType: 'user', actorEmail: 'ada@example.com' });
    expect(response.text).not.toMatch(/organizationId|actorUserId|_id|__v|passwordHash|tokenVersion/);
    expect(response.text).not.toContain(ada.user.id);
  });

  it('pages through stored entries', async ({ skip }) => {
    if (!transactionsAvailable) skip();
    const { app, ada } = await setup();
    for (const name of ['One', 'Two', 'Three']) {
      await rename(app, ada.organizationId, ada.cookie, name);
    }

    const first = await list(app, ada.organizationId, ada.cookie, '?limit=2');
    const second = await list(app, ada.organizationId, ada.cookie, '?page=2&limit=2');

    expect(first.body.hasMore).toBe(true);
    expect(first.body.auditLogs.map((entry) => entry.details.name)).toEqual(['Three', 'Two']);
    expect(second.body.hasMore).toBe(false);
    expect(second.body.auditLogs.map((entry) => entry.details.name)).toEqual(['One']);
  });

  it('keeps each organization’s audit log to itself', async ({ skip }) => {
    if (!transactionsAvailable) skip();
    const { app, ada, grace } = await setup();
    await rename(app, ada.organizationId, ada.cookie, 'Acme Logistics');
    await rename(app, grace.organizationId, grace.cookie, 'Globex Corporation');

    const adaList = await list(app, ada.organizationId, ada.cookie);
    const graceReadsAda = await list(app, ada.organizationId, grace.cookie);

    expect(adaList.body.auditLogs.map((entry) => entry.details.name)).toEqual(['Acme Logistics']);
    expect(graceReadsAda.status).toBe(404);
    expect(graceReadsAda.text).not.toContain('Acme');
  });

  it('refuses to rename another organization and records nothing', async ({ skip }) => {
    if (!transactionsAvailable) skip();
    const { app, ada, grace } = await setup();

    const response = await request(app)
      .patch(`/api/v1/organizations/${ada.organizationId}?organizationId=${grace.organizationId}`)
      .set('Origin', ORIGIN)
      .set('Cookie', grace.cookie)
      .set('X-Organization-Id', grace.organizationId)
      .send({ name: 'Renamed by Grace', organizationId: grace.organizationId });

    expect(response.status).toBe(404);
    expect((await Organization.findById(ada.organizationId).lean()).name).toBe('Acme');
    expect((await Organization.findById(grace.organizationId).lean()).name).toBe('Globex');
    expect(await AuditLog.countDocuments()).toBe(0);
  });

  it('lets an admin rename, but refuses a member both the rename and the audit log', async ({ skip }) => {
    if (!transactionsAvailable) skip();
    const { app, ada } = await setup();
    const admin = await signUp(app, { origin: ORIGIN, email: 'admin@example.com' });
    const member = await signUp(app, { origin: ORIGIN, email: 'member@example.com' });
    await membershipStore.create({ organizationId: ada.organizationId, userId: admin.user.id, role: 'admin' });
    await membershipStore.create({ organizationId: ada.organizationId, userId: member.user.id, role: 'member' });

    const byMember = await rename(app, ada.organizationId, member.cookie, 'Renamed by member');
    const memberReads = await list(app, ada.organizationId, member.cookie);
    const byAdmin = await rename(app, ada.organizationId, admin.cookie, 'Renamed by admin');

    expect(byMember.status).toBe(403);
    expect(memberReads.status).toBe(403);
    expect(byAdmin.status).toBe(200);
    expect((await Organization.findById(ada.organizationId).lean()).name).toBe('Renamed by admin');
    const entries = await AuditLog.find().lean();
    expect(entries).toHaveLength(1);
    expect(entries[0].actorUserId.toString()).toBe(admin.user.id);
  });

  it('rolls back the rename when the audit entry cannot be written', async ({ skip }) => {
    if (!transactionsAvailable) skip();
    const failingAuditLogs = {
      ...auditLogStore,
      create: async () => {
        throw new Error('simulated audit failure');
      },
    };
    const { app, ada } = await setup({ auditLogs: failingAuditLogs });

    const response = await rename(app, ada.organizationId, ada.cookie, 'Acme Logistics');

    expect(response.status).toBe(500);
    expect((await Organization.findById(ada.organizationId).lean()).name).toBe('Acme');
    expect(await AuditLog.countDocuments()).toBe(0);
  });

  it('only lists entries through their own organization', async () => {
    const organizationA = new mongoose.Types.ObjectId().toString();
    const organizationB = new mongoose.Types.ObjectId().toString();
    await auditLogStore.create(organizationA, {
      actorType: 'system',
      action: 'organization.updated',
      resourceType: 'organization',
      resourceId: organizationA,
      details: { name: 'A' },
    });

    expect(await auditLogStore.listForOrganization(organizationA, { skip: 0, limit: 10 })).toHaveLength(1);
    expect(await auditLogStore.listForOrganization(organizationB, { skip: 0, limit: 10 })).toEqual([]);
  });

  it('refuses actions and actor types outside the schema', async () => {
    const organizationId = new mongoose.Types.ObjectId().toString();

    await expect(
      auditLogStore.create(organizationId, { actorType: 'root', action: 'organization.updated', resourceType: 'organization' }),
    ).rejects.toThrow();
    await expect(
      auditLogStore.create(organizationId, { actorType: 'system', action: 'database.dropped', resourceType: 'organization' }),
    ).rejects.toThrow();
    expect(await AuditLog.countDocuments()).toBe(0);
  });

  it('indexes audit entries by organization first', async () => {
    await AuditLog.init();

    const indexes = await AuditLog.collection.indexes();

    expect(indexes.map((index) => index.key)).toContainEqual({ organizationId: 1, createdAt: -1, _id: -1 });
  });
});
