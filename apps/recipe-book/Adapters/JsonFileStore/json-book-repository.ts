import { join } from 'node:path';
import { unlink } from 'node:fs/promises';
import { Book } from '../../Domain/Aggregates/book.ts';
import type { BookData } from '../../Domain/Aggregates/book.ts';
import type { BookRepository } from '../../Domain/Ports/Repositories/book-repository.ts';
import { BOOKS_DIR } from './paths.ts';
import { ensureDir, readJson, writeJson, listIds } from './json-file.ts';

/** BookRepository backed by one JSON file per book under BOOKS_DIR. */
export class JsonBookRepository implements BookRepository {
  async list(): Promise<Book[]> {
    const ids = await listIds(BOOKS_DIR);
    const books = await Promise.all(ids.map((id) => this.get(id)));
    return books.filter((b): b is Book => b !== null).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }

  async get(id: string): Promise<Book | null> {
    const data = await readJson<BookData>(join(BOOKS_DIR, `${id}.json`));
    return data ? Book.fromJSON(data) : null;
  }

  async save(book: Book): Promise<void> {
    await ensureDir(BOOKS_DIR);
    await writeJson(join(BOOKS_DIR, `${book.id}.json`), book.toJSON());
  }

  async delete(id: string): Promise<void> {
    await unlink(join(BOOKS_DIR, `${id}.json`)).catch(() => {});
  }
}
