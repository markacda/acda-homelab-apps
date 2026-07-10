import { Category } from '../../Domain/Aggregates/category.ts'
import type { CategoryRepository } from '../../Domain/Ports/Repositories/category-repository.ts'
import type { RecipeRepository } from '../../Domain/Ports/Repositories/recipe-repository.ts'
import type { UpdateCategoryRequest } from '../../Models/Requests/category-requests.ts'
import { NotFoundError } from '../../Domain/Exceptions/not-found-error.ts'

/**
 * Application service for the managed category list: CRUD, plus cascading a
 * rename onto the recipes that reference the category by name. Deleting a
 * category leaves those recipes' category text untouched (they simply drop out
 * of the managed list, and still group as before at generation time).
 */
export class CategoryService {
  private categories: CategoryRepository
  private recipes: RecipeRepository

  constructor(categories: CategoryRepository, recipes: RecipeRepository) {
    this.categories = categories
    this.recipes = recipes
  }

  list(): Promise<Category[]> {
    return this.categories.list()
  }

  async getOrThrow(id: string): Promise<Category> {
    const category = await this.categories.get(id)
    if (!category) throw new NotFoundError('Category not found.')
    return category
  }

  async create(name: string): Promise<Category> {
    const category = Category.create(name)
    await this.categories.save(category)
    return category
  }

  /** Rename a category and cascade the new name onto every recipe that used the old one. */
  async update(id: string, patch: UpdateCategoryRequest): Promise<Category> {
    const category = await this.getOrThrow(id)
    if ('name' in patch) {
      const oldName = category.name
      category.rename(patch.name ?? '')
      await this.categories.save(category)
      if (category.name !== oldName) await this.renameOnRecipes(oldName, category.name)
    }
    return category
  }

  async delete(id: string): Promise<void> {
    await this.categories.delete(id)
  }

  /** Update every recipe whose category matches `from` to use `to`. */
  private async renameOnRecipes(from: string, to: string): Promise<void> {
    const recipes = await this.recipes.list()
    await Promise.all(
      recipes
        .filter((r) => r.category === from)
        .map((r) => {
          r.applyEdits({ category: to })
          return this.recipes.save(r)
        })
    )
  }
}
