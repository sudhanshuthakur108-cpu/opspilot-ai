export const OWNER = 'owner';
export const ADMIN = 'admin';
export const MEMBER = 'member';

export const ROLES = Object.freeze([OWNER, ADMIN, MEMBER]);

export function isRole(value) {
  return ROLES.includes(value);
}
