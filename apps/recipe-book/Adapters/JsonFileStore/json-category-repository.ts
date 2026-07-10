import { join } from 'node:path';
import { unlink } from 'node:fs/promises';
import { Category } from '../../Domain/Aggregates/category.ts';
import type { CategoryData } from '../../Domain/Aggregates/category.ts';
import type { CategoryRepository } from '../../Domain/Ports/Repositories/category-repository.ts';
import { CATEGORIES_DIR } from './paths.ts';
import { ensureDir, readJson, writeJson, listIds } from './json-file.ts';

/** CategoryRepository backed by one JSON file per category under CATEGORIES_DIR. */
export class JsonCategoryRepository implements CategoryRepository {
  async list(): Promise<Category[]> {
    const ids = await listIds(CATEGORIES_DIR);
    const categories = await Promise.all(ids.map((id) => this.get(id)));
    return categories.filter((c): c is Category => c !== null).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }

  async get(id: string): Promise<Category | null> {
    const data = await readJson<CategoryData>(join(CATEGORIES_DIR, `${id}.json`));
    return data ? Category.fromJSON(data) : null;
  }

  async save(category: Category): Promise<void> {
    await ensureDir(CATEGORIES_DIR);
    await writeJson(join(CATEGORIES_DIR, `${category.id}.json`), category.toJSON());
  }

  async delete(id: string): Promise<void> {
    await unlink(join(CATEGORIES_DIR, `${id}.json`)).catch(() => {});
  }
}
