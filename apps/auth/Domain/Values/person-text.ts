import { ValidationError } from '../Exceptions/validation-error.ts';

// One place where every person-facing text field is trimmed, normalized and
// length-capped (issue #187), so no field ends up hardened ad hoc. Applies to the
// names and the email; passwords are handled separately below.

/** Maximum length of a first or last name (issue #187). */
export const MAX_NAME_LENGTH = 100;
/** Practical maximum for an address, per RFC 5321's 254-character path limit. */
export const MAX_EMAIL_LENGTH = 254;
/** Minimum acceptable password length at registration. */
export const MIN_PASSWORD_LENGTH = 8;
/** Cap on a submitted password — also bounds the per-request scrypt cost. */
export const MAX_PASSWORD_LENGTH = 200;

/** Length in code points, so an astral character (emoji) counts as one, not two. */
function codePointLength(value: string): number {
  return [...value].length;
}

/**
 * Normalize untrusted text: reject a non-string, compose to NFC (so visually equal input
 * compares equal), collapse every whitespace run to a single space, drop the control
 * characters that survive that (they carry no meaning in a name and would forge fields
 * in the JSON-Lines logs), then trim. Anything reducing to nothing returns ''.
 *
 * Collapsing before stripping is deliberate: a line break becomes a space, so a pasted
 * two-line value reads as "Ada Lovelace" rather than running the words together.
 */
export function cleanText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .replace(/\p{Cc}/gu, '')
    .trim();
}

/** `cleanText` plus a required, length-capped result. Blank or over-long → 400. */
export function requireText(value: unknown, field: string, max = MAX_NAME_LENGTH): string {
  const cleaned = cleanText(value);
  if (!cleaned) throw new ValidationError(`A ${field.toLowerCase()} is required.`);
  if (codePointLength(cleaned) > max) throw new ValidationError(`${field} must be at most ${max} characters.`);
  return cleaned;
}

/**
 * Normalize and validate an email address: cleaned, capped, lowercased, and shaped like
 * `local@domain` (exactly one `@`, both sides non-empty, no whitespace anywhere). This
 * is the app's single email rule — the aggregate and the request mappers both use it.
 */
export function requireEmail(value: unknown): string {
  const email = requireText(value, 'Email address', MAX_EMAIL_LENGTH).toLowerCase();
  const [local, domain, ...rest] = email.split('@');
  if (rest.length > 0 || !local || !domain || /\s/.test(email)) {
    throw new ValidationError('A valid email address is required.');
  }
  return email;
}

/**
 * Validate a submitted password. Deliberately NOT run through `cleanText`: trimming or
 * collapsing whitespace would silently alter a legitimate secret. Only the type and the
 * length bounds are enforced — the hash is what gets stored.
 */
export function requirePassword(value: unknown, minLength = MIN_PASSWORD_LENGTH): string {
  if (typeof value !== 'string' || value.length === 0) throw new ValidationError('A password is required.');
  if (value.length < minLength) throw new ValidationError(`Password must be at least ${minLength} characters.`);
  if (value.length > MAX_PASSWORD_LENGTH) {
    throw new ValidationError(`Password must be at most ${MAX_PASSWORD_LENGTH} characters.`);
  }
  return value;
}
