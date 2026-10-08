import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Membership } from './membership.model.js';
import { membershipStore } from './membership.store.js';

// Covers the store's own logic with `save` mocked; organizations.integration.test.js runs
// the same operations against a real MongoDB when one is configured.
const organizationId = new mongoose.Types.ObjectId().toString();
const userId = new mongoose.Types.ObjectId().toString();

afterEach(() => {
  vi.restoreAllMocks();
});

describe('membershipStore.create', () => {
  it('saves within the given session and returns a plain membership with string IDs', async () => {
    const createdAt = new Date();
    const save = vi.spyOn(Membership.prototype, 'save').mockImplementation(async function saved() {
      this.createdAt = createdAt;
      return this;
    });
    const session = { id: 'session' };

    const membership = await membershipStore.create({ organizationId, userId, role: 'owner' }, { session });

    expect(save).toHaveBeenCalledWith({ session });
    expect(membership).toEqual({
      id: expect.stringMatching(/^[0-9a-f]{24}$/),
      organizationId,
      userId,
      role: 'owner',
      createdAt,
    });
  });

  it('returns null when the user already belongs to the organization', async () => {
    vi.spyOn(Membership.prototype, 'save').mockRejectedValue(
      Object.assign(new Error('E11000 duplicate key error'), { code: 11000 }),
    );

    await expect(membershipStore.create({ organizationId, userId, role: 'member' })).resolves.toBeNull();
  });

  it('rejects an invalid role before reaching the database', async () => {
    await expect(membershipStore.create({ organizationId, userId, role: 'superadmin' })).rejects.toThrow(
      /role/,
    );
  });
});
