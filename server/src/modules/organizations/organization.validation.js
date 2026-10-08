import { HttpError } from '../../lib/httpError.js';
import { NAME_MAX_LENGTH, SLUG_FORMAT, SLUG_MAX_LENGTH } from './organization.model.js';

function invalid(message) {
  return new HttpError(400, 'VALIDATION_FAILED', message);
}

// Body: { name: string, slug: string }. Other fields are ignored, including any attempt to
// name an owner: the owner is always the authenticated user. Applies the same rules and
// normalization as the Organization model so requests fail here rather than in the database.
export function validateNewOrganization(body) {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (name.length === 0 || name.length > NAME_MAX_LENGTH) {
    throw invalid(`Name must be between 1 and ${NAME_MAX_LENGTH} characters`);
  }

  const slug = typeof body?.slug === 'string' ? body.slug.trim().toLowerCase() : '';
  if (slug.length > SLUG_MAX_LENGTH || !SLUG_FORMAT.test(slug)) {
    throw invalid(
      `Slug must be up to ${SLUG_MAX_LENGTH} lowercase letters and numbers, in words separated by single hyphens`,
    );
  }

  return { name, slug };
}
