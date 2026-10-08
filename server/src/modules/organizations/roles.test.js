import { describe, expect, it } from 'vitest';
import { isRole, ROLES } from './roles.js';

describe('roles', () => {
  it('defines owner, admin and member', () => {
    expect(ROLES).toEqual(['owner', 'admin', 'member']);
    expect(Object.isFrozen(ROLES)).toBe(true);
  });

  it.each(ROLES)('accepts %s', (role) => {
    expect(isRole(role)).toBe(true);
  });

  it.each(['Owner', 'superadmin', 'viewer', '', undefined, null, 1])('rejects %s', (value) => {
    expect(isRole(value)).toBe(false);
  });
});
