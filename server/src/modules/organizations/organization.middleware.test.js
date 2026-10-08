import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createMembershipTestApp } from '../../testing/membershipTestApp.js';
import { createMemoryOrganizationStores } from '../../testing/memoryOrganizationStores.js';
import { createMemoryUserStore } from '../../testing/memoryUserStore.js';
import { createRequireMembership, requireOrganizationRole } from './organization.middleware.js';

const UNKNOWN_ORGANIZATION_ID = 'f'.repeat(24);

// Two users and two organizations: Ada owns Acme, Grace owns Globex.
async function setup() {
  const users = createMemoryUserStore();
  const { organizations, memberships } = createMemoryOrganizationStores();
  const testApp = createMembershipTestApp({ users, memberships });

  const ada = await users.create({ email: 'ada@example.com', passwordHash: 'unused' });
  const grace = await users.create({ email: 'grace@example.com', passwordHash: 'unused' });
  const acme = await organizations.create({ name: 'Acme', slug: 'acme' });
  const globex = await organizations.create({ name: 'Globex', slug: 'globex' });
  await memberships.create({ organizationId: acme.id, userId: ada.id, role: 'owner' });
  await memberships.create({ organizationId: globex.id, userId: grace.id, role: 'owner' });

  return {
    ...testApp,
    memberships,
    ada,
    grace,
    acme,
    globex,
    adaCookie: await testApp.sessionCookie(ada),
  };
}

function probe(app, organizationId, cookie) {
  const req = request(app).get(`/organizations/${organizationId}/probe`);
  return cookie ? req.set('Cookie', cookie) : req;
}

function errorBody(response) {
  const { requestId, ...rest } = response.body.error;
  expect(requestId).toBe(response.headers['x-request-id']);
  return rest;
}

describe('organization membership middleware', () => {
  it.each([
    ['for a member organization', (ctx) => ctx.acme.id],
    ['before validating the organization ID', () => 'not-an-id'],
  ])('rejects an unauthenticated request with 401 %s', async (_, organizationId) => {
    const ctx = await setup();

    const response = await probe(ctx.app, organizationId(ctx));

    expect(response.status).toBe(401);
    expect(errorBody(response)).toEqual({ code: 'UNAUTHENTICATED', message: 'Authentication required' });
  });

  it('lets a member through with only the verified membership attached', async () => {
    const { app, acme, ada, adaCookie } = await setup();

    const response = await probe(app, acme.id, adaCookie);

    expect(response.status).toBe(200);
    expect(response.body.membership).toEqual({
      id: expect.stringMatching(/^[0-9a-f]{24}$/),
      organizationId: acme.id,
      userId: ada.id,
      role: 'owner',
    });
  });

  it.each(['owner', 'admin', 'member'])('attaches the %s role from the database', async (role) => {
    const { app, memberships, globex, ada, adaCookie } = await setup();
    await memberships.create({ organizationId: globex.id, userId: ada.id, role });

    const response = await probe(app, globex.id, adaCookie);

    expect(response.body.membership).toMatchObject({ organizationId: globex.id, userId: ada.id, role });
  });

  it('gives a non-member the same 404 as an organization that does not exist', async () => {
    const { app, globex, adaCookie } = await setup();

    const otherOrganization = await probe(app, globex.id, adaCookie);
    const missingOrganization = await probe(app, UNKNOWN_ORGANIZATION_ID, adaCookie);

    expect(otherOrganization.status).toBe(404);
    expect(missingOrganization.status).toBe(404);
    expect(errorBody(otherOrganization)).toEqual({ code: 'NOT_FOUND', message: 'Organization not found' });
    expect(errorBody(missingOrganization)).toEqual(errorBody(otherOrganization));
  });

  it('checks the organization in the route against the signed-in user', async () => {
    const { app, memberships, globex, ada, adaCookie } = await setup();
    const find = vi.spyOn(memberships, 'find');

    await probe(app, globex.id, adaCookie);

    expect(find).toHaveBeenCalledTimes(1);
    expect(find).toHaveBeenCalledWith(globex.id, ada.id);
  });

  it('ignores user IDs, roles and organization IDs supplied anywhere else in the request', async () => {
    const { app, acme, globex, grace, adaCookie } = await setup();

    const response = await request(app)
      .post(`/organizations/${globex.id}/managers-only?userId=${grace.id}&organizationId=${acme.id}`)
      .set('Cookie', adaCookie)
      .set('X-User-Id', grace.id)
      .send({ userId: grace.id, organizationId: acme.id, role: 'owner' });

    expect(response.status).toBe(404);
  });

  it.each([
    ['not hex', 'z'.repeat(24)],
    ['too short', 'f'.repeat(23)],
    ['too long', 'f'.repeat(25)],
    ['a word', 'acme'],
    ['an operator-looking string', '{"$ne":null}'],
  ])('rejects an organization ID that is %s with 400 before looking anything up', async (_, organizationId) => {
    const { app, memberships, adaCookie } = await setup();
    const find = vi.spyOn(memberships, 'find');

    const response = await probe(app, encodeURIComponent(organizationId), adaCookie);

    expect(response.status).toBe(400);
    expect(errorBody(response)).toEqual({ code: 'VALIDATION_FAILED', message: 'Organization ID is not valid' });
    expect(find).not.toHaveBeenCalled();
  });

  it('notices a removed membership on the next request', async () => {
    const { app, memberships, acme, adaCookie } = await setup();
    memberships.records.clear();

    expect((await probe(app, acme.id, adaCookie)).status).toBe(404);
  });

  it('handles a lookup failure through the central error handler without leaking details', async () => {
    const { app, memberships, logs, acme, adaCookie } = await setup();
    memberships.find = async () => {
      throw new Error('connection lost to mongodb://app-user:pw-secret@db.example.com/opspilot');
    };

    const response = await probe(app, acme.id, adaCookie);

    expect(response.status).toBe(500);
    expect(errorBody(response)).toEqual({ code: 'INTERNAL_ERROR', message: 'Something went wrong' });
    expect(response.text).not.toMatch(/pw-secret|mongodb|stack/);
    expect(JSON.stringify(logs.entries)).not.toContain('pw-secret');
  });

  it('puts authentication in front of the membership check', () => {
    const requireAuth = () => {};

    const middleware = createRequireMembership({ requireAuth, memberships: {} });

    expect(middleware).toHaveLength(2);
    expect(middleware[0]).toBe(requireAuth);
  });
});

describe('requireOrganizationRole', () => {
  function postAs(app, path, cookie, body) {
    return request(app).post(path).set('Cookie', cookie).send(body);
  }

  it.each(['owner', 'admin'])('lets an %s through when owners and admins are allowed', async (role) => {
    const { app, memberships, globex, ada, adaCookie } = await setup();
    await memberships.create({ organizationId: globex.id, userId: ada.id, role });

    const response = await postAs(app, `/organizations/${globex.id}/managers-only`, adaCookie);

    expect(response.status).toBe(200);
    expect(response.body.membership.role).toBe(role);
  });

  it('rejects a member with 403, whatever role the body claims', async () => {
    const { app, memberships, globex, ada, adaCookie } = await setup();
    await memberships.create({ organizationId: globex.id, userId: ada.id, role: 'member' });

    const response = await postAs(app, `/organizations/${globex.id}/managers-only`, adaCookie, { role: 'owner' });

    expect(response.status).toBe(403);
    expect(errorBody(response)).toEqual({ code: 'FORBIDDEN', message: 'You do not have permission to do this' });
  });

  it('applies a single allowed role', async () => {
    const { app, memberships, globex, ada, adaCookie } = await setup();
    await memberships.create({ organizationId: globex.id, userId: ada.id, role: 'admin' });

    const response = await postAs(app, `/organizations/${globex.id}/owners-only`, adaCookie);

    expect(response.status).toBe(403);
  });

  it('gives a non-member 404 rather than 403', async () => {
    const { app, globex, adaCookie } = await setup();

    const response = await postAs(app, `/organizations/${globex.id}/managers-only`, adaCookie);

    expect(response.status).toBe(404);
  });

  it.each([
    ['no roles', []],
    ['an unknown role', ['superadmin']],
    ['a known and an unknown role', ['owner', 'Admin']],
    ['a non-string role', ['owner', undefined]],
  ])('refuses to be configured with %s', (_, roles) => {
    expect(() => requireOrganizationRole(...roles)).toThrow(/needs one or more known roles/);
  });

  it('fails closed when used without the membership middleware', () => {
    const middleware = requireOrganizationRole('owner');

    expect(() => middleware({}, {}, () => {})).toThrow(/must run after the membership middleware/);
  });
});
