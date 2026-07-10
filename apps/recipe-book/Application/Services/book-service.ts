import { Book } from '../../Domain/Aggregates/book.ts'
import type { Recipe } from '../../Domain/Aggregates/recipe.ts'
import type { BookRepository } from '../../Domain/Ports/Repositories/book-repository.ts'
import type { RecipeRepository } from '../../Domain/Ports/Repositories/recipe-repository.ts'
import type { UpdateBookRequest } from '../../Models/Requests/book-requests.ts'
import { NotFoundError } from '../../Domain/Exceptions/not-found-error.ts'

/**
 * Application service for recipe books: CRUD plus resolving a book's ordered
 * recipe ids into full recipes (skipping any that no longer exist).
 */
export class BookService {
  private books: BookRepository
  private recipes: RecipeRepository

  constructor(books: BookRepository, recipes: RecipeRepository) {
    this.books = books
    this.recipes = recipes
  }

  list(): Promise<Book[]> {
    return this.books.list()
  }

  async getOrThrow(id: string): Promise<Book> {
    const book = await this.books.get(id)
    if (!book) throw new NotFoundError('Book not found.')
    return book
  }

  async createBook(name: string): Promise<Book> {
    const book = Book.create(name)
    await this.books.save(book)
    return book
  }

  async update(id: string, patch: UpdateBookRequest): Promise<Book> {
    const book = await this.getOrThrow(id)
    if ('name' in patch) book.rename(patch.name ?? '')
    if ('recipeIds' in patch) book.setRecipeIds(patch.recipeIds ?? [])
    await this.books.save(book)
    return book
  }

  async delete(id: string): Promise<void> {
    await this.books.delete(id)
  }

  /** Resolve a book's ordered recipe ids into recipes, skipping any that are gone. */
  async resolveRecipes(book: Book): Promise<Recipe[]> {
    const recipes = await Promise.all(book.recipeIds.map((id) => this.recipes.get(id)))
    return recipes.filter((r): r is Recipe => r !== null)
  }
}
