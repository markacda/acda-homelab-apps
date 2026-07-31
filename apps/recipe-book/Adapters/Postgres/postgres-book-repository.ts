import type { Pool } from 'pg';
import { Book } from '../../Domain/Aggregates/book.ts';
import type { BookData } from '../../Domain/Aggregates/book.ts';
import type { BookRepository } from '../../Domain/Ports/Repositories/book-repository.ts';
import { listJson, getJson, upsertJson, deleteJson } from './jsonb-store.ts';

/** BookRepository backed by one JSONB row per book in the `books` table. */
export class PostgresBookRepository implements BookRepository {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async list(): Promise<Book[]> {
    return (await listJson<BookData>(this.pool, 'books')).map((d) => Book.fromJSON(d));
  }

  async get(id: string): Promise<Book | null> {
    const data = await getJson<BookData>(this.pool, 'books', id);
    return data ? Book.fromJSON(data) : null;
  }

  async save(book: Book): Promise<void> {
    await upsertJson(this.pool, 'books', book.toJSON());
  }

  async delete(id: string): Promise<void> {
    await deleteJson(this.pool, 'books', id);
  }
}
