import type { Pool } from 'pg';
import { Person } from '../../Domain/Aggregates/person.ts';
import type { PersonRepository } from '../../Domain/Ports/Repositories/person-repository.ts';

// PersonRepository backed by a `persons` row plus a `person_roles` join table.
// Roles are aggregated on read (LEFT JOIN + array_agg) and replaced wholesale on
// write inside a transaction, so the domain layer stays unaware of the join.

/** A `persons` row joined with its aggregated `person_roles.role` values. */
export interface PersonRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: Date | string;
  roles: string[] | null;
}

/** Pure mapper: a persons row (+ its roles) -> the Person aggregate. Exported for tests. */
export function rowToPerson(row: PersonRow): Person {
  return Person.fromJSON({
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    roles: row.roles ?? [],
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  });
}

// Reads share this projection. array_remove drops the NULL that array_agg
// produces for a person with no roles, so `roles` is always a clean array.
const SELECT_BASE = `SELECT p.id, p.email, p.password_hash, p.created_at,
       array_remove(array_agg(r.role), NULL) AS roles
  FROM persons p
  LEFT JOIN person_roles r ON r.person_id = p.id`;

export class PostgresPersonRepository implements PersonRepository {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async findByEmail(email: string): Promise<Person | null> {
    const res = await this.pool.query<PersonRow>(`${SELECT_BASE} WHERE p.email = $1 GROUP BY p.id`, [email]);
    return res.rows[0] ? rowToPerson(res.rows[0]) : null;
  }

  async findById(id: string): Promise<Person | null> {
    const res = await this.pool.query<PersonRow>(`${SELECT_BASE} WHERE p.id = $1 GROUP BY p.id`, [id]);
    return res.rows[0] ? rowToPerson(res.rows[0]) : null;
  }

  async list(): Promise<Person[]> {
    const res = await this.pool.query<PersonRow>(`${SELECT_BASE} GROUP BY p.id ORDER BY p.created_at DESC`);
    return res.rows.map(rowToPerson);
  }

  async save(person: Person): Promise<void> {
    const data = person.toJSON();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO persons (id, email, password_hash, created_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO UPDATE
             SET email = EXCLUDED.email,
                 password_hash = EXCLUDED.password_hash`,
        [data.id, data.email, data.passwordHash, data.createdAt]
      );
      // Replace the person's role set wholesale (simplest correct sync).
      await client.query('DELETE FROM person_roles WHERE person_id = $1', [data.id]);
      for (const role of data.roles) {
        await client.query('INSERT INTO person_roles (person_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING', [data.id, role]);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async delete(id: string): Promise<void> {
    // person_roles and sessions rows cascade via ON DELETE CASCADE.
    await this.pool.query('DELETE FROM persons WHERE id = $1', [id]);
  }
}
