import { optStr } from '../../../Common/http-utils/index.ts';
import { ValidationError } from '../../Domain/Exceptions/validation-error.ts';
import type { Person } from '../../Domain/Aggregates/person.ts';

/** A person as exposed over the API — never includes the password hash. */
export interface PersonView {
  id: string;
  email: string;
  roles: string[];
}

/** Email + password credentials parsed from a request body. */
export interface Credentials {
  email: string;
  password: string;
}

/** Parse and require { email, password } from a request body. Missing → 400. */
export function toCredentials(body: unknown): Credentials {
  const b = (body ?? {}) as Record<string, unknown>;
  const email = optStr(b.email);
  const password = optStr(b.password);
  if (!email) throw new ValidationError('An email address is required.');
  if (!password) throw new ValidationError('A password is required.');
  return { email, password };
}

/** Project a Person aggregate to its safe API shape (drops passwordHash). */
export function toPersonView(person: Person): PersonView {
  return { id: person.id, email: person.email, roles: [...person.roles] };
}
