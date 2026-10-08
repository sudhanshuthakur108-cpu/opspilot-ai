// The server's limit for organization slugs.
const SLUG_MAX_LENGTH = 60;

// "  Acme Logistics, Inc. " → "acme-logistics-inc". Accents are dropped ("Café" → "cafe") and every
// run of other characters becomes a single hyphen. Returns "" when nothing usable is left.
export function toSlug(name) {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/, '');
}
