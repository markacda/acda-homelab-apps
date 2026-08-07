import { randomUUID } from 'node:crypto';
import { ValidationError } from '../Exceptions/validation-error.ts';
import { EmailAddress } from '../ValueObjects/email-address.ts';
import { FirstName } from '../ValueObjects/first-name.ts';
import { LastName } from '../ValueObjects/last-name.ts';

// The Person aggregate: a homelab account identified by email (= username), with a
// first and last name, an already-hashed password and a set of roles (User,
// Administrator). Password hashing and token issuance live in the authentication
// backend (issue #149); this aggregate only holds the hashed value. Its invariants are
// carried by the value objects it is built from — an EmailAddress, and a FirstName and
// LastName that are null only for an account predating issue #187 — plus the hash and
// role checks below.

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

/** The raw fields needed to register a new person (id/createdAt are assigned here). */
export interface NewPerson {
  email: unknown;
  firstName: unknown;
  lastName: unknown;
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
  readonly email: EmailAddress;
  firstName: FirstName | null;
  lastName: LastName | null;
  passwordHash: string;
  roles: string[];
  readonly createdAt: string;

  /** The identity is stamped here; only `fromJSON` passes persisted values back in. */
  constructor(
    email: EmailAddress,
    firstName: FirstName | null,
    lastName: LastName | null,
    passwordHash: string,
    roles: string[] = [],
    id: string = randomUUID(),
    createdAt: string = new Date().toISOString()
  ) {
    this.email = email;
    this.firstName = firstName;
    this.lastName = lastName;
    this.passwordHash = requireHash(passwordHash);
    this.roles = dedupeRoles(roles);
    this.id = id;
    this.createdAt = createdAt;
  }

  /** Register a new person from raw input. Both names are required here (issue #187). */
  static create(input: NewPerson): Person {
    return new Person(
      new EmailAddress(input.email),
      new FirstName(input.firstName),
      new LastName(input.lastName),
      input.passwordHash,
      input.roles ?? []
    );
  }

  /**
   * Hydrate a persisted row. A blank name is not rejected but becomes null: accounts
   * predating issue #187 have no name in the database, and they must still load so their
   * owner can fill it in on the /auth account page.
   */
  static fromJSON(data: PersonData): Person {
    return new Person(
      new EmailAddress(data.email),
      data.firstName ? new FirstName(data.firstName) : null,
      data.lastName ? new LastName(data.lastName) : null,
      data.passwordHash,
      data.roles,
      data.id,
      data.createdAt
    );
  }

  /** True for a pre-#187 account that has not filled in its name yet. */
  hasName(): boolean {
    return this.firstName !== null && this.lastName !== null;
  }

  /**
   * The only rename path: both names are required, so a blank name can't be saved back.
   * Both are constructed before either is assigned, so a rejected rename leaves the person
   * exactly as it was rather than half-applied.
   */
  rename(firstName: unknown, lastName: unknown): void {
    const first = new FirstName(firstName);
    const last = new LastName(lastName);
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
      email: this.email.value,
      firstName: this.firstName?.value ?? '',
      lastName: this.lastName?.value ?? '',
      passwordHash: this.passwordHash,
      roles: [...this.roles],
      createdAt: this.createdAt,
    };
  }
}
