import type { Pool } from 'pg';
import { Book } from '../../Domain/Aggregates/book.ts';
import type { BookData } from '../../Domain/Aggregates/book.ts';
import type { BookRepository } from '../../Domain/Ports/Repositories/book-repository.ts';
import { withTransaction } from './tx.ts';

// BookRepository over the normalized schema (issue #166): the book's scalar
// fields live on the `books` row and its ordered page list lives in the
// `book_recipes` join table (order_index 1..n), each row a real FK into
// `recipes`. The aggregate's BookData (with its `recipeIds` array) is
// reconstructed on read and written back on save.

interface BookRow {
  id: string;
  name: string;
  created_at: Date;
  updated_at: Date;
}

function iso(value: Date): string {
  return value.toISOString();
}

export class PostgresBookRepository implements BookRepository {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async list(): Promise<Book[]> {
    const books = await this.pool.query<BookRow>('SELECT id, name, created_at, updated_at FROM books ORDER BY updated_at DESC');
    const links = await this.pool.query<{ book_id: string; recipe_id: string }>(
      'SELECT book_id, recipe_id FROM book_recipes ORDER BY book_id, order_index'
    );
    const recipeIds = new Map<string, string[]>();
    for (const link of links.rows) {
      const list = recipeIds.get(link.book_id) ?? [];
      list.push(link.recipe_id);
      recipeIds.set(link.book_id, list);
    }
    return books.rows.map((row) => Book.fromJSON(toBookData(row, recipeIds.get(row.id) ?? [])));
  }

  async get(id: string): Promise<Book | null> {
    const books = await this.pool.query<BookRow>('SELECT id, name, created_at, updated_at FROM books WHERE id = $1', [id]);
    const row = books.rows[0];
    if (!row) return null;
    const links = await this.pool.query<{ recipe_id: string }>('SELECT recipe_id FROM book_recipes WHERE book_id = $1 ORDER BY order_index', [id]);
    return Book.fromJSON(
      toBookData(
        row,
        links.rows.map((l) => l.recipe_id)
      )
    );
  }

  async save(book: Book): Promise<void> {
    const data = book.toJSON();
    await withTransaction(this.pool, async (client) => {
      await client.query(
        `INSERT INTO books (id, name, created_at, updated_at) VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = EXCLUDED.updated_at`,
        [data.id, data.name, data.createdAt, data.updatedAt]
      );
      await client.query('DELETE FROM book_recipes WHERE book_id = $1', [data.id]);
      // Keep only ids that still exist (stale ids were tolerated before) and
      // drop duplicates, preserving order; then number the pages 1..n.
      const existing = await client.query<{ id: string }>('SELECT id FROM recipes WHERE id = ANY($1::text[])', [data.recipeIds]);
      const valid = new Set(existing.rows.map((r) => r.id));
      const seen = new Set<string>();
      const ordered: string[] = [];
      for (const id of data.recipeIds) {
        if (valid.has(id) && !seen.has(id)) {
          seen.add(id);
          ordered.push(id);
        }
      }
      if (ordered.length > 0) {
        const orders = ordered.map((_, i) => i + 1);
        await client.query(
          `INSERT INTO book_recipes (book_id, order_index, recipe_id)
             SELECT $1, ord, rid FROM unnest($2::int[], $3::text[]) AS t(ord, rid)`,
          [data.id, orders, ordered]
        );
      }
    });
  }

  async delete(id: string): Promise<void> {
    // book_recipes rows cascade via their FK.
    await this.pool.query('DELETE FROM books WHERE id = $1', [id]);
  }
}

function toBookData(row: BookRow, recipeIds: string[]): BookData {
  return {
    id: row.id,
    name: row.name,
    recipeIds,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}
