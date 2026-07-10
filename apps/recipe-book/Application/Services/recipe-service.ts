import { Recipe } from '../../Domain/Aggregates/recipe.ts'
import type { RecipeContent } from '../../Domain/Aggregates/recipe.ts'
import type { RecipeRepository } from '../../Domain/Ports/Repositories/recipe-repository.ts'
import type { ImageStore } from '../../Domain/Ports/image-store.ts'
import { NotFoundError } from '../../Domain/Exceptions/not-found-error.ts'
import { DomainError } from '../../Domain/Exceptions/domain-error.ts'

/**
 * Application service for the recipe library: creates/updates recipes and keeps
 * the aggregate's image gallery in step with the image store (orphaned files are
 * deleted). Orchestrates the RecipeRepository + ImageStore ports.
 */
export class RecipeService {
  private recipes: RecipeRepository
  private images: ImageStore

  constructor(recipes: RecipeRepository, images: ImageStore) {
    this.recipes = recipes
    this.images = images
  }

  list(): Promise<Recipe[]> {
    return this.recipes.list()
  }

  async getOrThrow(id: string): Promise<Recipe> {
    const recipe = await this.recipes.get(id)
    if (!recipe) throw new NotFoundError('Recipe not found.')
    return recipe
  }

  /** Create a recipe; if a remote image URL is given, best-effort download it. */
  async create(content: RecipeContent): Promise<Recipe> {
    const recipe = Recipe.create(content)
    await this.recipes.save(recipe)
    if (content.imageUrl) await this.tryAttachFromUrl(recipe, content.imageUrl)
    return recipe
  }

  /** Apply text edits and/or a reordered gallery, deleting any orphaned images. */
  async update(id: string, edits: Partial<RecipeContent>, images?: string[]): Promise<Recipe> {
    const recipe = await this.getOrThrow(id)
    recipe.applyEdits(edits)
    if (images) {
      const removed = recipe.reorderImages(images)
      for (const filename of removed) await this.images.delete(filename)
    }
    await this.recipes.save(recipe)
    return recipe
  }

  async delete(id: string): Promise<void> {
    const recipe = await this.recipes.get(id)
    for (const filename of recipe?.images ?? []) await this.images.delete(filename)
    await this.recipes.delete(id)
  }

  /** Append an uploaded image (throws 415 for an unsupported format). */
  async attachUpload(recipe: Recipe, buffer: Buffer, contentType: string | null, originalName: string): Promise<Recipe> {
    const filename = await this.images.saveUpload(recipe.id, buffer, contentType, originalName)
    recipe.appendImage(filename)
    await this.recipes.save(recipe)
    return recipe
  }

  /** Append a downloaded image (throws 422 if unreachable/unsupported). */
  async attachFromUrl(recipe: Recipe, url: string): Promise<Recipe> {
    const filename = await this.images.downloadFromUrl(recipe.id, url)
    if (!filename) {
      throw new DomainError('Could not download that image (unreachable or unsupported format).', 422)
    }
    recipe.appendImage(filename)
    await this.recipes.save(recipe)
    return recipe
  }

  /** Best-effort image download used on create/import: silently skips on failure. */
  private async tryAttachFromUrl(recipe: Recipe, url: string): Promise<void> {
    const filename = await this.images.downloadFromUrl(recipe.id, url)
    if (!filename) return
    recipe.appendImage(filename)
    await this.recipes.save(recipe)
  }
}
