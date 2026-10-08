import { describe, expect, it } from 'vitest';
import { toSlug } from './slug.js';

describe('toSlug', () => {
  it.each([
    ['Acme Logistics', 'acme-logistics'],
    ['  Acme   Logistics  ', 'acme-logistics'],
    ['Acme Logistics, Inc.', 'acme-logistics-inc'],
    ['north_east / south-west', 'north-east-south-west'],
    ['--Acme--', 'acme'],
    ['Café Délices', 'cafe-delices'],
    ['Team 42', 'team-42'],
    ['ACME', 'acme'],
  ])('turns %j into %j', (name, slug) => {
    expect(toSlug(name)).toBe(slug);
  });

  it.each(['', '   ', '!!!', '— — —', '日本語'])('returns an empty slug for %j', (name) => {
    expect(toSlug(name)).toBe('');
  });

  it('caps the slug at 60 characters without leaving a trailing hyphen', () => {
    const slug = toSlug(`${'a'.repeat(59)} bcd`);

    expect(slug).toBe('a'.repeat(59));
    expect(toSlug('word '.repeat(30)).length).toBeLessThanOrEqual(60);
    expect(toSlug('word '.repeat(30))).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it('is predictable', () => {
    expect(toSlug('Acme Logistics')).toBe(toSlug('Acme Logistics'));
  });
});
