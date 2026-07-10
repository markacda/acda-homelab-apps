import type { Book } from '../../Domain/Aggregates/book.ts';
import type { Recipe } from '../../Domain/Aggregates/recipe.ts';

/**
 * Port for turning a book + its resolved, ordered recipes into a rendered
 * artifact on disk. Implemented in the Adapters layer (Tectonic/LaTeX). Each
 * method returns the path of the written file.
 */
export interface DocumentGenerator {
  generateTex(book: Book, recipes: Recipe[]): Promise<string>;
  generatePdf(book: Book, recipes: Recipe[]): Promise<string>;
  /** The path a previously generated artifact for `bookId` would live at. */
  outputPath(bookId: string, format: 'tex' | 'pdf'): string;
}
