import type { Book } from "../../Aggregates/book.ts";

/** Persistence port for the Book aggregate. Implemented in the Adapters layer. */
export interface BookRepository {
  /** All books, newest-updated first. */
  list(): Promise<Book[]>;
  get(id: string): Promise<Book | null>;
  save(book: Book): Promise<void>;
  delete(id: string): Promise<void>;
}
