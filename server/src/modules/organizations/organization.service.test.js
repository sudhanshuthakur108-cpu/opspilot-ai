import { describe, expect, it, vi } from 'vitest';
import { createOrganizationWithOwner, listOrganizationsForUser } from './organization.service.js';

const OWNER_ID = 'a'.repeat(24);
const SESSION = { id: 'transaction-session' };

// Unit tests with fake stores. Whether an aborted transaction really discards the
// organization is checked against MongoDB in organizations.integration.test.js.
function fakes() {
  const organization = { id: 'b'.repeat(24), name: 'Acme', slug: 'acme', createdAt: new Date() };
  return {
    organizations: { create: vi.fn(async () => organization) },
    memberships: {
      create: vi.fn(async (fields) => ({ id: 'c'.repeat(24), ...fields, createdAt: new Date() })),
    },
    withTransaction: vi.fn((work) => work(SESSION)),
    organization,
  };
}

describe('createOrganizationWithOwner', () => {
  it('creates the organization and its owner membership in one transaction', async () => {
    const deps = fakes();

    const result = await createOrganizationWithOwner(deps, { name: 'Acme', slug: 'acme', ownerUserId: OWNER_ID });

    expect(deps.withTransaction).toHaveBeenCalledTimes(1);
    expect(deps.organizations.create).toHaveBeenCalledWith({ name: 'Acme', slug: 'acme' }, { session: SESSION });
    expect(deps.memberships.create).toHaveBeenCalledWith(
      { organizationId: deps.organization.id, userId: OWNER_ID, role: 'owner' },
      { session: SESSION },
    );
    expect(result).toEqual({
      organization: deps.organization,
      membership: expect.objectContaining({ organizationId: deps.organization.id, userId: OWNER_ID, role: 'owner' }),
    });
  });

  it('rejects a taken slug by throwing, so the transaction aborts', async () => {
    const deps = fakes();
    deps.organizations.create.mockResolvedValue(null);

    const error = await createOrganizationWithOwner(deps, { name: 'Acme', slug: 'acme', ownerUserId: OWNER_ID }).catch(
      (caught) => caught,
    );

    expect(error).toMatchObject({ status: 409, code: 'SLUG_UNAVAILABLE' });
    expect(deps.memberships.create).not.toHaveBeenCalled();
  });

  it('propagates a membership failure out of the transaction', async () => {
    const deps = fakes();
    deps.memberships.create.mockRejectedValue(new Error('write conflict'));

    await expect(
      createOrganizationWithOwner(deps, { name: 'Acme', slug: 'acme', ownerUserId: OWNER_ID }),
    ).rejects.toThrow('write conflict');
  });

  it('refuses to commit an organization whose owner membership was not created', async () => {
    const deps = fakes();
    deps.memberships.create.mockResolvedValue(null);

    await expect(
      createOrganizationWithOwner(deps, { name: 'Acme', slug: 'acme', ownerUserId: OWNER_ID }),
    ).rejects.toThrow('Owner membership was not created');
  });
});

describe('listOrganizationsForUser', () => {
  const organization = (id, name) => ({ id, name, slug: name.toLowerCase(), createdAt: new Date() });

  function listFakes({ memberships = [], organizations = [] } = {}) {
    return {
      memberships: { listForUser: vi.fn(async () => memberships) },
      organizations: { findByIds: vi.fn(async () => organizations) },
    };
  }

  it('returns an empty list without loading organizations when the user has no memberships', async () => {
    const deps = listFakes();

    await expect(listOrganizationsForUser(deps, OWNER_ID)).resolves.toEqual([]);
    expect(deps.memberships.listForUser).toHaveBeenCalledWith(OWNER_ID);
    expect(deps.organizations.findByIds).not.toHaveBeenCalled();
  });

  it('loads only the organizations named by the memberships and adds the role, keeping store order', async () => {
    const acme = organization('1'.repeat(24), 'Acme');
    const globex = organization('2'.repeat(24), 'Globex');
    const deps = listFakes({
      memberships: [
        { organizationId: acme.id, userId: OWNER_ID, role: 'owner' },
        { organizationId: globex.id, userId: OWNER_ID, role: 'member' },
      ],
      organizations: [globex, acme],
    });

    const result = await listOrganizationsForUser(deps, OWNER_ID);

    expect(deps.organizations.findByIds).toHaveBeenCalledWith([acme.id, globex.id]);
    expect(result).toEqual([
      { ...globex, role: 'member' },
      { ...acme, role: 'owner' },
    ]);
  });

  it('skips memberships whose organization no longer exists', async () => {
    const acme = organization('1'.repeat(24), 'Acme');
    const deps = listFakes({
      memberships: [
        { organizationId: acme.id, userId: OWNER_ID, role: 'admin' },
        { organizationId: '9'.repeat(24), userId: OWNER_ID, role: 'owner' },
      ],
      organizations: [acme],
    });

    await expect(listOrganizationsForUser(deps, OWNER_ID)).resolves.toEqual([{ ...acme, role: 'admin' }]);
  });
});
