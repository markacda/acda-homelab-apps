import type { PersonRepository } from '../../Domain/Ports/Repositories/person-repository.ts';
import { ValidationError } from '../../Domain/Exceptions/validation-error.ts';
import { NotFoundError } from '../../Domain/Exceptions/not-found-error.ts';
import { toPersonView } from '../Mappers/auth-mapper.ts';
import type { PersonView } from '../Mappers/auth-mapper.ts';
import { ROLE_USER, ROLE_ADMINISTRATOR } from '../../../Common/auth/index.ts';

// Administrator-only user administration (issue #152): list the persons store and
// grant/revoke roles. A thin orchestration over PersonRepository following the
// load-mutate-save pattern — the Person aggregate owns the role invariants
// (addRole de-dupes, removeRole is a no-op filter), and save() replaces the role
// set wholesale. The HTTP gate (requireRole Administrator) is applied at the mount
// point, so this service assumes the caller is already authorized.

/** The roles that may be assigned via the admin API — single-sourced with the guard. */
const ASSIGNABLE_ROLES: readonly string[] = [ROLE_USER, ROLE_ADMINISTRATOR];

export class UserAdminService {
  private readonly persons: PersonRepository;

  constructor(persons: PersonRepository) {
    this.persons = persons;
  }

  /** All users (newest-created first), optionally filtered by an email substring. */
  async listUsers(search?: string): Promise<PersonView[]> {
    const persons = await this.persons.list();
    const needle = search?.trim().toLowerCase();
    const filtered = needle ? persons.filter((p) => p.email.toLowerCase().includes(needle)) : persons;
    return filtered.map(toPersonView);
  }

  /** Grant a role to a user. Unknown role → 400, unknown user → 404. Idempotent. */
  async addRole(userId: string, role: string): Promise<PersonView> {
    this.requireAssignableRole(role);
    const person = await this.load(userId);
    person.addRole(role);
    await this.persons.save(person);
    return toPersonView(person);
  }

  /** Revoke a role from a user. Unknown role → 400, unknown user → 404. Idempotent. */
  async removeRole(userId: string, role: string): Promise<PersonView> {
    this.requireAssignableRole(role);
    const person = await this.load(userId);
    person.removeRole(role);
    await this.persons.save(person);
    return toPersonView(person);
  }

  private requireAssignableRole(role: string): void {
    if (!ASSIGNABLE_ROLES.includes(role)) throw new ValidationError(`Unknown role: ${role}.`);
  }

  private async load(userId: string) {
    const person = await this.persons.findById(userId);
    if (!person) throw new NotFoundError('No user with that id.');
    return person;
  }
}
