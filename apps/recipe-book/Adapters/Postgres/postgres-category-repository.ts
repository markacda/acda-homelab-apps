import type { Pool } from 'pg';
import { Category } from '../../Domain/Aggregates/category.ts';
import type { CategoryData } from '../../Domain/Aggregates/category.ts';
import type { CategoryRepository } from '../../Domain/Ports/Repositories/category-repository.ts';

// CategoryRepository over the normalized schema (issue #166): a category is now
// a plain row of columns. Recipes reference it by the `recipes.category_id`
// foreign key (ON DELETE SET NULL), so a rename is visible everywhere at once
// and deleting a category simply unlinks its recipes — no application-level
// cascade is needed anymore.

interface CategoryRow {
  id: string;
  name: string;
  created_at: Date;
  updated_at: Date;
}

function toCategoryData(row: CategoryRow): CategoryData {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class PostgresCategoryRepository implements CategoryRepository {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async list(): Promise<Category[]> {
    const res = await this.pool.query<CategoryRow>('SELECT id, name, created_at, updated_at FROM categories ORDER BY updated_at DESC');
    return res.rows.map((row) => Category.fromJSON(toCategoryData(row)));
  }

  async get(id: string): Promise<Category | null> {
    const res = await this.pool.query<CategoryRow>('SELECT id, name, created_at, updated_at FROM categories WHERE id = $1', [id]);
    const row = res.rows[0];
    return row ? Category.fromJSON(toCategoryData(row)) : null;
  }

  async save(category: Category): Promise<void> {
    const data = category.toJSON();
    await this.pool.query(
      `INSERT INTO categories (id, name, created_at, updated_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = EXCLUDED.updated_at`,
      [data.id, data.name, data.createdAt, data.updatedAt]
    );
  }

  async delete(id: string): Promise<void> {
    // recipes.category_id is ON DELETE SET NULL, so linked recipes are unlinked.
    await this.pool.query('DELETE FROM categories WHERE id = $1', [id]);
  }
}
