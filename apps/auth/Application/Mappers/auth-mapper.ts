import { ValidationError } from '../../Domain/Exceptions/validation-error.ts';
import { requireEmail, requirePassword, requireText } from '../../Domain/Values/person-text.ts';
import type { Person } from '../../Domain/Aggregates/person.ts';

// Request-body parsing for the auth surface. Every field goes through the shared
// Domain/Values/person-text helpers (issue #187), so trimming, Unicode normalization,
// control-character stripping and the length caps are applied in exactly one place.

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
 * Parse { email, password } for `POST /login`. The email is normalized but its shape is
 * NOT enforced here: a malformed address must fail as "invalid email or password" (401)
 * rather than leak a 400 that distinguishes it from a wrong password.
 */
export function toCredentials(body: unknown): Credentials {
  const b = (body ?? {}) as Record<string, unknown>;
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  if (!email) throw new ValidationError('An email address is required.');
  if (typeof b.password !== 'string' || !b.password) throw new ValidationError('A password is required.');
  return { email, password: b.password };
}

/** Parse and require { email, password, firstName, lastName } for `POST /register`. */
export function toRegistration(body: unknown): Registration {
  const b = (body ?? {}) as Record<string, unknown>;
  return {
    email: requireEmail(b.email),
    password: requirePassword(b.password),
    ...toPersonName(b),
  };
}

/** Parse and require { firstName, lastName } for `PATCH /me`. */
export function toPersonName(body: unknown): PersonName {
  const b = (body ?? {}) as Record<string, unknown>;
  return {
    firstName: requireText(b.firstName, 'First name'),
    lastName: requireText(b.lastName, 'Last name'),
  };
}

/** Project a Person aggregate to its safe API shape (drops passwordHash). */
export function toPersonView(person: Person): PersonView {
  return {
    id: person.id,
    email: person.email,
    firstName: person.firstName,
    lastName: person.lastName,
    roles: [...person.roles],
  };
}
