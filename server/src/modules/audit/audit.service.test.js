import { describe, expect, it } from 'vitest';
import { createMemoryAuditLogStore } from '../../testing/memoryAuditLogStore.js';
import { createMemoryUserStore } from '../../testing/memoryUserStore.js';
import { listAuditLogs, recordAuditEvent } from './audit.service.js';

const ORGANIZATION_ID = 'b'.repeat(24);
const OTHER_ORGANIZATION_ID = 'c'.repeat(24);
const USER_ID = 'a'.repeat(24);

const renamed = (overrides = {}) => ({
  organizationId: ORGANIZATION_ID,
  actor: { type: 'user', userId: USER_ID },
  action: 'organization.updated',
  resourceId: ORGANIZATION_ID,
  details: { previousName: 'Acme', name: 'Acme Logistics' },
  ...overrides,
});

describe('recordAuditEvent', () => {
  it('stores the event under the organization, with the resource type that belongs to the action', async () => {
    const auditLogs = createMemoryAuditLogStore();

    const entry = await recordAuditEvent(auditLogs, renamed());

    expect(entry).toEqual({
      id: expect.any(String),
      actorType: 'user',
      actorUserId: USER_ID,
      action: 'organization.updated',
      resourceType: 'organization',
      resourceId: ORGANIZATION_ID,
      details: { previousName: 'Acme', name: 'Acme Logistics' },
      createdAt: expect.any(Date),
    });
    expect(auditLogs.records).toHaveLength(1);
    expect(auditLogs.records[0].organizationId).toBe(ORGANIZATION_ID);
  });

  it('keeps only the details the action allows, so secrets and request data are never stored', async () => {
    const auditLogs = createMemoryAuditLogStore();

    await recordAuditEvent(
      auditLogs,
      renamed({
        details: {
          previousName: 'Acme',
          name: 'Acme Logistics',
          password: 'correct horse battery',
          token: 'eyJhbGciOiJIUzI1NiJ9.secret',
          authorization: 'Bearer sk-secret',
          prompt: 'Summarize every customer',
          body: { name: 'Acme Logistics', organizationId: OTHER_ORGANIZATION_ID },
        },
      }),
    );

    expect(auditLogs.records[0].details).toEqual({ previousName: 'Acme', name: 'Acme Logistics' });
    expect(JSON.stringify(auditLogs.records)).not.toMatch(/horse|secret|Bearer|Summarize/);
  });

  it('records AI and system events without a user', async () => {
    const auditLogs = createMemoryAuditLogStore();

    await recordAuditEvent(auditLogs, renamed({ actor: { type: 'ai' } }));
    await recordAuditEvent(auditLogs, renamed({ actor: { type: 'system' } }));

    expect(auditLogs.records.map(({ actorType, actorUserId }) => ({ actorType, actorUserId }))).toEqual([
      { actorType: 'ai', actorUserId: null },
      { actorType: 'system', actorUserId: null },
    ]);
  });

  it.each([
    ['an unknown action', renamed({ action: 'organization.deleted' }), 'Unknown audit action "organization.deleted"'],
    ['a prototype key as the action', renamed({ action: '__proto__' }), 'Unknown audit action "__proto__"'],
    ['an unknown actor type', renamed({ actor: { type: 'admin', userId: USER_ID } }), 'Unknown audit actor type "admin"'],
    ['a missing actor', renamed({ actor: undefined }), 'Unknown audit actor type "undefined"'],
    ['a user actor without a user', renamed({ actor: { type: 'user' } }), 'A user actor needs a user ID'],
    ['an AI actor claiming a user', renamed({ actor: { type: 'ai', userId: USER_ID } }), 'other actors must not have one'],
    ['a detail that is not text', renamed({ details: { name: { $ne: null } } }), 'Audit detail "name" must be text'],
    ['an overlong detail', renamed({ details: { name: 'a'.repeat(201) } }), 'Audit detail "name" must be text'],
  ])('refuses %s and stores nothing', async (_, event, message) => {
    const auditLogs = createMemoryAuditLogStore();

    await expect(recordAuditEvent(auditLogs, event)).rejects.toThrow(message);
    expect(auditLogs.records).toHaveLength(0);
  });
});

describe('listAuditLogs', () => {
  async function setup(count) {
    const auditLogs = createMemoryAuditLogStore();
    const users = createMemoryUserStore();
    const ada = await users.create({ email: 'ada@example.com', passwordHash: 'hash-never-returned' });
    for (let index = 1; index <= count; index += 1) {
      await recordAuditEvent(auditLogs, renamed({ actor: { type: 'user', userId: ada.id }, details: { name: `Name ${index}` } }));
    }
    return { auditLogs, users, ada };
  }

  it('returns a page of entries newest first, with the actor’s email instead of their ID', async () => {
    const { auditLogs, users } = await setup(3);

    const result = await listAuditLogs({ auditLogs, users }, ORGANIZATION_ID, { page: 1, limit: 2 });

    expect(result).toMatchObject({ page: 1, limit: 2, hasMore: true });
    expect(result.auditLogs.map((entry) => entry.details.name)).toEqual(['Name 3', 'Name 2']);
    expect(result.auditLogs[0]).toEqual({
      id: expect.any(String),
      actorType: 'user',
      actorEmail: 'ada@example.com',
      action: 'organization.updated',
      resourceType: 'organization',
      resourceId: ORGANIZATION_ID,
      details: { name: 'Name 3' },
      createdAt: expect.any(Date),
    });
    expect(JSON.stringify(result)).not.toMatch(/actorUserId|organizationId|hash-never-returned/);
  });

  it('reports the last page', async () => {
    const { auditLogs, users } = await setup(3);

    const result = await listAuditLogs({ auditLogs, users }, ORGANIZATION_ID, { page: 2, limit: 2 });

    expect(result.hasMore).toBe(false);
    expect(result.auditLogs.map((entry) => entry.details.name)).toEqual(['Name 1']);
  });

  it('shows no email for an actor that no longer exists, and does not look users up for AI events', async () => {
    const auditLogs = createMemoryAuditLogStore();
    const users = createMemoryUserStore();
    await recordAuditEvent(auditLogs, renamed({ actor: { type: 'user', userId: 'f'.repeat(24) } }));
    await recordAuditEvent(auditLogs, renamed({ actor: { type: 'ai' } }));

    const result = await listAuditLogs({ auditLogs, users }, ORGANIZATION_ID, { page: 1, limit: 25 });

    expect(result.auditLogs.map(({ actorType, actorEmail }) => ({ actorType, actorEmail }))).toEqual([
      { actorType: 'ai', actorEmail: null },
      { actorType: 'user', actorEmail: null },
    ]);
  });

  it('only returns the requested organization’s entries', async () => {
    const { auditLogs, users } = await setup(1);
    await recordAuditEvent(auditLogs, renamed({ organizationId: OTHER_ORGANIZATION_ID, resourceId: OTHER_ORGANIZATION_ID }));

    const result = await listAuditLogs({ auditLogs, users }, OTHER_ORGANIZATION_ID, { page: 1, limit: 25 });

    expect(result.auditLogs).toHaveLength(1);
    expect(result.auditLogs[0].resourceId).toBe(OTHER_ORGANIZATION_ID);
  });
});
