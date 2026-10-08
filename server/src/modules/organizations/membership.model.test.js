import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { Membership } from './membership.model.js';
import { ROLES } from './roles.js';

const organizationId = new mongoose.Types.ObjectId();
const userId = new mongoose.Types.ObjectId();

function validationErrors(fields) {
  return new Membership(fields)
    .validate()
    .then(() => ({}))
    .catch((error) => error.errors);
}

// These run without a database: Mongoose validates documents locally.
describe('Membership model', () => {
  it.each(ROLES)('accepts the %s role', async (role) => {
    expect(await validationErrors({ organizationId, userId, role })).toEqual({});
  });

  it.each(['superadmin', 'Owner', ''])('rejects the role %j', async (role) => {
    expect(await validationErrors({ organizationId, userId, role })).toHaveProperty('role');
  });

  it('requires an organization, a user and a role', async () => {
    expect(Object.keys(await validationErrors({})).sort()).toEqual(['organizationId', 'role', 'userId']);
  });

  it('rejects IDs that are not ObjectIds', async () => {
    const errors = await validationErrors({ organizationId: 'acme', userId: '123', role: 'member' });

    expect(Object.keys(errors).sort()).toEqual(['organizationId', 'userId']);
  });

  it('declares a unique index on organization and user', () => {
    expect(Membership.schema.indexes()).toContainEqual([
      { organizationId: 1, userId: 1 },
      expect.objectContaining({ unique: true }),
    ]);
  });

  it('indexes memberships by user', () => {
    expect(Membership.schema.indexes()).toContainEqual([{ userId: 1 }, expect.any(Object)]);
  });
});
