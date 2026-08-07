import { ValidationError } from '../../Domain/Exceptions/validation-error.ts';
import { EmailAddress } from '../../Domain/ValueObjects/email-address.ts';
import { FirstName } from '../../Domain/ValueObjects/first-name.ts';
import { LastName } from '../../Domain/ValueObjects/last-name.ts';
import type { Person } from '../../Domain/Aggregates/person.ts';

// Request-body parsing for the auth surface. Every person field is parsed by constructing
// the value object that owns its rule, so trimming, Unicode normalization, control-character
// stripping and the length caps are applied in exactly one place (issue #187). The password
// is the exception: a plaintext secret is request input, not a Person invariant, so its
// bounds live here.

/** Minimum acceptable password length at registration. */
export const MIN_PASSWORD_LENGTH = 8;
/** Cap on a submitted password — also bounds the per-request scrypt cost. */
export const MAX_PASSWORD_LENGTH = 200;

/** A person as exposed over the API — never includes the password hash. */
export interface PersonView {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
}

/** Email + password credentials parsed from a request body. */
export interface Credentials {
  email: string;
  password: string;
}

/** A first + last name parsed from a request body. */
export interface PersonName {
  firstName: string;
  lastName: string;
}

/** Everything `POST /register` needs: credentials plus the required name. */
export interface Registration extends Credentials, PersonName {}

/**
 * Validate a submitted password. Deliberately NOT cleaned: trimming or collapsing
 * whitespace would silently alter a legitimate secret. Only the type and the length
 * bounds are enforced — the hash is what gets stored.
 */
export function requirePassword(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) throw new ValidationError('A password is required.');
  if (value.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (value.length > MAX_PASSWORD_LENGTH) {
    throw new ValidationError(`Password must be at most ${MAX_PASSWORD_LENGTH} characters.`);
  }
  return value;
}

/**
 * Parse { email, password } for `POST /login`. The email is normalized but its shape is
 * NOT enforced here: a malformed address must fail as "invalid email or password" (401)
 * rather than leak a 400 that distinguishes it from a wrong password.
 */
export function toCredentials(body: unknown): Credentials {
  const b = (body ?? {}) as Record<string, unknown>;
  const email = EmailAddress.normalize(b.email);
  if (!email) throw new ValidationError('An email address is required.');
  if (typeof b.password !== 'string' || !b.password) throw new ValidationError('A password is required.');
  return { email, password: b.password };
}

/** Parse and require { email, password, firstName, lastName } for `POST /register`. */
export function toRegistration(body: unknown): Registration {
  const b = (body ?? {}) as Record<string, unknown>;
  return {
    email: new EmailAddress(b.email).value,
    password: requirePassword(b.password),
    ...toPersonName(b),
  };
}

/** Parse and require { firstName, lastName } for `PATCH /me`. */
export function toPersonName(body: unknown): PersonName {
  const b = (body ?? {}) as Record<string, unknown>;
  return {
    firstName: new FirstName(b.firstName).value,
    lastName: new LastName(b.lastName).value,
  };
}

/** Project a Person aggregate to its safe API shape (drops passwordHash). */
export function toPersonView(person: Person): PersonView {
  return {
    id: person.id,
    email: person.email.value,
    firstName: person.firstName?.value ?? '',
    lastName: person.lastName?.value ?? '',
    roles: [...person.roles],
  };
}
