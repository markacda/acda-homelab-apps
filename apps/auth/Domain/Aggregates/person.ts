import { randomUUID } from 'node:crypto';
import { ValidationError } from '../Exceptions/validation-error.ts';

// The Person aggregate: a homelab account identified by email (= username), with
// an already-hashed password and a set of roles (User, Administrator). Password
// hashing and token issuance live in the authentication backend (issue #149);
// this aggregate only holds the hashed value and enforces the invariants — a
// normalized, non-empty email and a de-duplicated, non-blank role set.

/** The persisted shape of a person (what the Postgres repository reads and writes). */
export interface PersonData {
  id: string;
  email: string;
  passwordHash: string;
  roles: string[];
  createdAt: string;
}

/** The fields needed to create a new person (id/createdAt are assigned here). */
export interface NewPerson {
  email: string;
  passwordHash: string;
  roles?: string[];
}

function normalizeEmail(email: string | undefined): string {
  const normalized = (email ?? '').trim().toLowerCase();
  if (!normalized) throw new ValidationError('An email address is required.');
  return normalized;
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
  passwordHash: string;
  roles: string[];
  readonly createdAt: string;

  constructor(data: PersonData) {
    this.id = data.id;
    this.email = data.email;
    this.passwordHash = data.passwordHash;
    this.roles = [...data.roles];
    this.createdAt = data.createdAt;
  }

  static create(input: NewPerson): Person {
    return new Person({
      id: randomUUID(),
      email: normalizeEmail(input.email),
      passwordHash: requireHash(input.passwordHash),
      roles: dedupeRoles(input.roles ?? []),
      createdAt: new Date().toISOString(),
    });
  }

  static fromJSON(data: PersonData): Person {
    return new Person(data);
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
      passwordHash: this.passwordHash,
      roles: [...this.roles],
      createdAt: this.createdAt,
    };
  }
}
