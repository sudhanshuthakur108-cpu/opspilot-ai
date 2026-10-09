import { HttpError } from '../../lib/httpError.js';
import { NAME_MAX_LENGTH, SLUG_FORMAT, SLUG_MAX_LENGTH } from './organization.model.js';

function invalid(message) {
  return new HttpError(400, 'VALIDATION_FAILED', message);
}

function readName(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  if (name.length === 0 || name.length > NAME_MAX_LENGTH) {
    throw invalid(`Name must be between 1 and ${NAME_MAX_LENGTH} characters`);
  }
  return name;
}

// Body: { name: string, slug: string }. Other fields are ignored, including any attempt to
// name an owner: the owner is always the authenticated user. Applies the same rules and
// normalization as the Organization model so requests fail here rather than in the database.
export function validateNewOrganization(body) {
  const name = readName(body?.name);

  const slug = typeof body?.slug === 'string' ? body.slug.trim().toLowerCase() : '';
  if (slug.length > SLUG_MAX_LENGTH || !SLUG_FORMAT.test(slug)) {
    throw invalid(
      `Slug must be up to ${SLUG_MAX_LENGTH} lowercase letters and numbers, in words separated by single hyphens`,
    );
  }

  return { name, slug };
}

// Body: { name: string }, the only setting that can change. Other fields are ignored: the slug,
// owner, members, roles and IDs of an organization cannot be changed through this request.
export function validateOrganizationChanges(body) {
  return { name: readName(body?.name) };
}
