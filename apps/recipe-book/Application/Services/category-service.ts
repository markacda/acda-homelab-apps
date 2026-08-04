import { Category } from '../../Domain/Aggregates/category.ts';
import type { CategoryRepository } from '../../Domain/Ports/Repositories/category-repository.ts';
import type { UpdateCategoryRequest } from '../../Models/Requests/category-requests.ts';
import { NotFoundError } from '../../Domain/Exceptions/not-found-error.ts';

/**
 * Application service for the managed category list: plain CRUD. Recipes
 * reference a category by the `recipes.category_id` foreign key, so a rename is
 * reflected on every recipe automatically and deleting a category simply
 * unlinks its recipes (ON DELETE SET NULL) — no application-level cascade.
 */
export class CategoryService {
  private categories: CategoryRepository;

  constructor(categories: CategoryRepository) {
    this.categories = categories;
  }

  list(): Promise<Category[]> {
    return this.categories.list();
  }

  async getOrThrow(id: string): Promise<Category> {
    const category = await this.categories.get(id);
    if (!category) throw new NotFoundError('Category not found.');
    return category;
  }

  async create(name: string): Promise<Category> {
    const category = Category.create(name);
    await this.categories.save(category);
    return category;
  }

  async update(id: string, patch: UpdateCategoryRequest): Promise<Category> {
    const category = await this.getOrThrow(id);
    if ('name' in patch) {
      category.rename(patch.name ?? '');
      await this.categories.save(category);
    }
    return category;
  }

  async delete(id: string): Promise<void> {
    await this.categories.delete(id);
  }
}
