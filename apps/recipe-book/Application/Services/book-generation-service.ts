import type { Book } from '../../Domain/Aggregates/book.ts'
import type { DocumentGenerator } from '../../Ports/Latex/document-generator.ts'
import { BookService } from './book-service.ts'
import { ValidationError } from '../../Domain/Exceptions/validation-error.ts'
import { DomainError } from '../../Domain/Exceptions/domain-error.ts'
import type { GenerateFormat } from '../../Models/Requests/book-requests.ts'

/**
 * Orchestrates rendering a book to a .tex or .pdf via the DocumentGenerator port.
 * Resolves the book's recipes first, rejects an empty book (400), and wraps a
 * failed render (e.g. missing Tectonic) as a 500 with the engine's message.
 */
export class BookGenerationService {
  private books: BookService
  private generator: DocumentGenerator

  constructor(books: BookService, generator: DocumentGenerator) {
    this.books = books
    this.generator = generator
  }

  async generate(id: string, format: GenerateFormat): Promise<{ format: GenerateFormat; recipeCount: number }> {
    const book = await this.books.getOrThrow(id)
    const recipes = await this.books.resolveRecipes(book)
    if (recipes.length === 0) throw new ValidationError('The book has no recipes to generate.')
    try {
      if (format === 'pdf') await this.generator.generatePdf(book, recipes)
      else await this.generator.generateTex(book, recipes)
    } catch (err) {
      throw new DomainError(err instanceof Error ? err.message : 'Generation failed.', 500)
    }
    return { format, recipeCount: recipes.length }
  }

  /** Where the last-generated artifact for `book` lives (for the download route). */
  outputPath(book: Book, format: GenerateFormat): string {
    return this.generator.outputPath(book.id, format)
  }
}
