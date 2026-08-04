import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CategoryService } from '../Application/Services/category-service.ts';
import { Category } from '../Domain/Aggregates/category.ts';
import { NotFoundError } from '../Domain/Exceptions/not-found-error.ts';
import type { CategoryRepository } from '../Domain/Ports/Repositories/category-repository.ts';

// Minimal in-memory fake of the category persistence port. The recipe->category
// link is now a DB foreign key, so rename/delete cascades are the database's job
// (not the service's) — the service is plain CRUD.
class FakeCategoryRepo implements CategoryRepository {
  store = new Map<string, Category>();
  list(): Promise<Category[]> {
    return Promise.resolve([...this.store.values()]);
  }
  get(id: string): Promise<Category | null> {
    return Promise.resolve(this.store.get(id) ?? null);
  }
  save(category: Category): Promise<void> {
    this.store.set(category.id, category);
    return Promise.resolve();
  }
  delete(id: string): Promise<void> {
    this.store.delete(id);
    return Promise.resolve();
  }
}

test('create then list returns the new category', async () => {
  const service = new CategoryService(new FakeCategoryRepo());
  const created = await service.create('Hoofdgerecht');
  const all = await service.list();
  assert.equal(all.length, 1);
  assert.equal(all[0].id, created.id);
  assert.equal(all[0].name, 'Hoofdgerecht');
});

test('update renames the category', async () => {
  const service = new CategoryService(new FakeCategoryRepo());
  const main = await service.create('Main');
  const renamed = await service.update(main.id, { name: 'Hoofdgerecht' });
  assert.equal(renamed.name, 'Hoofdgerecht');
  assert.equal((await service.getOrThrow(main.id)).name, 'Hoofdgerecht');
});

test('delete removes the category from the managed list', async () => {
  const service = new CategoryService(new FakeCategoryRepo());
  const main = await service.create('Main');
  await service.delete(main.id);
  assert.deepEqual(await service.list(), []);
});

test('getOrThrow throws NotFoundError for an unknown id', async () => {
  const service = new CategoryService(new FakeCategoryRepo());
  await assert.rejects(() => service.getOrThrow('missing'), NotFoundError);
});
