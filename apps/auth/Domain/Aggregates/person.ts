import { randomUUID } from 'node:crypto';
import { ValidationError } from '../Exceptions/validation-error.ts';
import { requireEmail, requireText } from '../Values/person-text.ts';

// The Person aggregate: a homelab account identified by email (= username), with a
// first and last name, an already-hashed password and a set of roles (User,
// Administrator). Password hashing and token issuance live in the authentication
// backend (issue #149); this aggregate only holds the hashed value and enforces the
// invariants — a normalized email, a required first/last name (issue #187), and a
// de-duplicated, non-blank role set.

/** The persisted shape of a person (what the Postgres repository reads and writes). */
export interface PersonData {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  passwordHash: string;
  roles: string[];
  createdAt: string;
}

/** The fields needed to create a new person (id/createdAt are assigned here). */
export interface NewPerson {
  email: string;
  firstName: string;
  lastName: string;
  passwordHash: string;
  roles?: string[];
}

function requireHash(passwordHash: string | undefined): string {
  const value = (passwordHash ?? '').trim();
  if (!value) throw new ValidationError('A password hash is required.');
  return value;
}

function requireRole(role: string): string {
  const value = role.trim();
  if (!value) throw new ValidationError('A role is required.');
  return value;
}

function dedupeRoles(roles: string[]): string[] {
  return [...new Set(roles.map((r) => r.trim()).filter(Boolean))];
}

export class Person {
  readonly id: string;
  email: string;
  firstName: string;
  lastName: string;
  passwordHash: string;
  roles: string[];
  readonly createdAt: string;

  constructor(data: PersonData) {
    this.id = data.id;
    this.email = data.email;
    this.firstName = data.firstName;
    this.lastName = data.lastName;
    this.passwordHash = data.passwordHash;
    this.roles = [...data.roles];
    this.createdAt = data.createdAt;
  }

  static create(input: NewPerson): Person {
    return new Person({
      id: randomUUID(),
      email: requireEmail(input.email),
      firstName: requireText(input.firstName, 'First name'),
      lastName: requireText(input.lastName, 'Last name'),
      passwordHash: requireHash(input.passwordHash),
      roles: dedupeRoles(input.roles ?? []),
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * Hydrate a persisted row as-is. Unlike `create` this does not re-validate: accounts
   * predating issue #187 have empty names in the database, and they must still load so
   * their owner can fill them in on the /auth account page.
   */
  static fromJSON(data: PersonData): Person {
    return new Person(data);
  }

  /** True for a pre-#187 account that has not filled in its name yet. */
  hasName(): boolean {
    return this.firstName.length > 0 && this.lastName.length > 0;
  }

  /**
   * The only rename path: both names are required, so a blank name can't be saved back.
   * Both are validated before either is assigned, so a rejected rename leaves the person
   * exactly as it was rather than half-applied.
   */
  rename(firstName: unknown, lastName: unknown): void {
    const first = requireText(firstName, 'First name');
    const last = requireText(lastName, 'Last name');
    this.firstName = first;
    this.lastName = last;
  }

  hasRole(role: string): boolean {
    return this.roles.includes(role);
  }

  addRole(role: string): void {
    const value = requireRole(role);
    if (!this.roles.includes(value)) this.roles.push(value);
  }

  removeRole(role: string): void {
    this.roles = this.roles.filter((r) => r !== role);
  }

  toJSON(): PersonData {
    return {
      id: this.id,
      email: this.email,
      firstName: this.firstName,
      lastName: this.lastName,
      passwordHash: this.passwordHash,
      roles: [...this.roles],
      createdAt: this.createdAt,
    };
  }
}
