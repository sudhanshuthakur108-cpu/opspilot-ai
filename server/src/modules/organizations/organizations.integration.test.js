import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectDatabase, disconnectDatabase, withTransaction } from '../../lib/database.js';
import { membershipStore } from './membership.store.js';
import { Membership } from './membership.model.js';
import { organizationStore } from './organization.store.js';
import { Organization } from './organization.model.js';
import { createOrganizationWithOwner } from './organization.service.js';

// Runs only when MONGODB_TEST_URI is set. Each run uses a new, randomly named database
// and drops only that database afterwards. Transaction tests also need a replica set.
const uri = process.env.MONGODB_TEST_URI;

const newId = () => new mongoose.Types.ObjectId().toString();
const stores = { organizations: organizationStore, memberships: membershipStore, withTransaction };

describe.skipIf(!uri)('organizations against MongoDB', () => {
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
    await Promise.all([Organization.deleteMany({}), Membership.deleteMany({})]);
  });

  it('creates an organization', async () => {
    const organization = await organizationStore.create({ name: 'Acme', slug: 'acme' });

    expect(await organizationStore.findById(organization.id)).toEqual(organization);
    expect(organization.createdAt).toBeInstanceOf(Date);
  });

  it('enforces unique slugs in the database', async () => {
    await organizationStore.create({ name: 'Acme', slug: 'acme' });

    await expect(organizationStore.create({ name: 'Another Acme', slug: 'ACME' })).resolves.toBeNull();
    expect(await Organization.countDocuments()).toBe(1);
  });

  it('creates a membership and finds it', async () => {
    const organizationId = newId();
    const userId = newId();

    const membership = await membershipStore.create({ organizationId, userId, role: 'admin' });

    expect(await membershipStore.find(organizationId, userId)).toEqual(membership);
    expect(await membershipStore.find(organizationId, newId())).toBeNull();
  });

  it('rejects adding the same user to the same organization twice', async () => {
    const organizationId = newId();
    const userId = newId();
    await membershipStore.create({ organizationId, userId, role: 'member' });

    await expect(membershipStore.create({ organizationId, userId, role: 'admin' })).resolves.toBeNull();
    await expect(membershipStore.create({ organizationId: newId(), userId, role: 'member' })).resolves.not.toBeNull();
    expect(await Membership.countDocuments({ userId })).toBe(2);
  });

  it('rejects an invalid role', async () => {
    await expect(
      membershipStore.create({ organizationId: newId(), userId: newId(), role: 'superadmin' }),
    ).rejects.toThrow(/role/);
    expect(await Membership.countDocuments()).toBe(0);
  });

  describe('createOrganizationWithOwner', () => {
    it('creates the organization with an owner membership', async ({ skip }) => {
      if (!transactionsAvailable) skip();
      const ownerUserId = newId();

      const { organization, membership } = await createOrganizationWithOwner(stores, {
        name: 'Acme',
        slug: 'acme',
        ownerUserId,
      });

      expect(await membershipStore.find(organization.id, ownerUserId)).toEqual(membership);
      expect(membership.role).toBe('owner');
    });

    it('leaves nothing behind when the membership write fails', async ({ skip }) => {
      if (!transactionsAvailable) skip();
      const failingMemberships = {
        create: async () => {
          throw new Error('simulated membership failure');
        },
      };

      await expect(
        createOrganizationWithOwner(
          { ...stores, memberships: failingMemberships },
          { name: 'Acme', slug: 'acme', ownerUserId: newId() },
        ),
      ).rejects.toThrow('simulated membership failure');

      expect(await Organization.countDocuments()).toBe(0);
      expect(await Membership.countDocuments()).toBe(0);
    });

    it('rejects a taken slug without creating a membership', async ({ skip }) => {
      if (!transactionsAvailable) skip();
      await createOrganizationWithOwner(stores, { name: 'Acme', slug: 'acme', ownerUserId: newId() });

      await expect(
        createOrganizationWithOwner(stores, { name: 'Acme Two', slug: 'acme', ownerUserId: newId() }),
      ).rejects.toMatchObject({ status: 409, code: 'SLUG_UNAVAILABLE' });

      expect(await Organization.countDocuments()).toBe(1);
      expect(await Membership.countDocuments()).toBe(1);
    });
  });
});
