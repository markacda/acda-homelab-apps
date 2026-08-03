import type { Person } from '../../Aggregates/person.ts';

/** Persistence port for the Person aggregate. Implemented in the Adapters layer. */
export interface PersonRepository {
  /** Look a person up by their (normalized) email = username. */
  findByEmail(email: string): Promise<Person | null>;
  findById(id: string): Promise<Person | null>;
  /** All persons, newest-created first. */
  list(): Promise<Person[]>;
  /** Insert or update the person and replace its role set. */
  save(person: Person): Promise<void>;
  delete(id: string): Promise<void>;
}
