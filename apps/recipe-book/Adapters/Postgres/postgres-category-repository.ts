import type { Pool } from 'pg';
import { Category } from '../../Domain/Aggregates/category.ts';
import type { CategoryData } from '../../Domain/Aggregates/category.ts';
import type { CategoryRepository } from '../../Domain/Ports/Repositories/category-repository.ts';
import { listJson, getJson, upsertJson, deleteJson } from './jsonb-store.ts';

/** CategoryRepository backed by one JSONB row per category in the `categories` table. */
export class PostgresCategoryRepository implements CategoryRepository {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async list(): Promise<Category[]> {
    return (await listJson<CategoryData>(this.pool, 'categories')).map((d) => Category.fromJSON(d));
  }

  async get(id: string): Promise<Category | null> {
    const data = await getJson<CategoryData>(this.pool, 'categories', id);
    return data ? Category.fromJSON(data) : null;
  }

  async save(category: Category): Promise<void> {
    await upsertJson(this.pool, 'categories', category.toJSON());
  }

  async delete(id: string): Promise<void> {
    await deleteJson(this.pool, 'categories', id);
  }
}
