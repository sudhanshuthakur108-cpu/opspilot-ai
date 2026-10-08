import { afterEach, describe, expect, it, vi } from 'vitest';
import { Organization } from './organization.model.js';
import { organizationStore } from './organization.store.js';

// Covers the store's own logic with `save` mocked; organizations.integration.test.js runs
// the same operations against a real MongoDB when one is configured.
afterEach(() => {
  vi.restoreAllMocks();
});

describe('organizationStore.create', () => {
  it('saves within the given session and returns a plain organization', async () => {
    const createdAt = new Date();
    const save = vi.spyOn(Organization.prototype, 'save').mockImplementation(async function saved() {
      this.createdAt = createdAt;
      return this;
    });
    const session = { id: 'session' };

    const organization = await organizationStore.create({ name: 'Acme', slug: 'acme' }, { session });

    expect(save).toHaveBeenCalledWith({ session });
    expect(organization).toEqual({ id: expect.stringMatching(/^[0-9a-f]{24}$/), name: 'Acme', slug: 'acme', createdAt });
  });

  it('returns null when the unique slug index rejects the insert', async () => {
    vi.spyOn(Organization.prototype, 'save').mockRejectedValue(
      Object.assign(new Error('E11000 duplicate key error'), { code: 11000 }),
    );

    await expect(organizationStore.create({ name: 'Acme', slug: 'acme' })).resolves.toBeNull();
  });

  it('passes other errors through', async () => {
    vi.spyOn(Organization.prototype, 'save').mockRejectedValue(new Error('network timeout'));

    await expect(organizationStore.create({ name: 'Acme', slug: 'acme' })).rejects.toThrow('network timeout');
  });
});
