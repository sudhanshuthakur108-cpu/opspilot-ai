import { describe, expect, it } from 'vitest';
import { Organization } from './organization.model.js';

function validationErrors(fields) {
  return new Organization(fields)
    .validate()
    .then(() => ({}))
    .catch((error) => error.errors);
}

// These run without a database: Mongoose validates and transforms documents locally.
describe('Organization model', () => {
  it('accepts a name and slug, normalizing both', async () => {
    const organization = new Organization({ name: '  Acme Logistics ', slug: ' Acme-Logistics ' });

    await expect(organization.validate()).resolves.toBeUndefined();
    expect(organization.name).toBe('Acme Logistics');
    expect(organization.slug).toBe('acme-logistics');
  });

  it('requires a name and a slug', async () => {
    expect(Object.keys(await validationErrors({})).sort()).toEqual(['name', 'slug']);
  });

  it.each(['acme logistics', 'acme_logistics', '-acme', 'acme-', 'acme--logistics', 'ácme', 'a'.repeat(61)])(
    'rejects the slug %s',
    async (slug) => {
      expect(await validationErrors({ name: 'Acme', slug })).toHaveProperty('slug');
    },
  );

  it('rejects a name longer than 100 characters', async () => {
    expect(await validationErrors({ name: 'a'.repeat(101), slug: 'acme' })).toHaveProperty('name');
  });

  it('declares a unique index on slug', () => {
    expect(Organization.schema.indexes()).toContainEqual([{ slug: 1 }, expect.objectContaining({ unique: true })]);
  });

  it('records creation and update times', () => {
    expect(Object.keys(Organization.schema.paths)).toEqual(expect.arrayContaining(['createdAt', 'updatedAt']));
  });
});
