import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CategoryService } from '../Application/Services/category-service.ts'
import { Category } from '../Domain/Aggregates/category.ts'
import { Recipe } from '../Domain/Aggregates/recipe.ts'
import { NotFoundError } from '../Domain/Exceptions/not-found-error.ts'
import type { CategoryRepository } from '../Domain/Ports/Repositories/category-repository.ts'
import type { RecipeRepository } from '../Domain/Ports/Repositories/recipe-repository.ts'

// Minimal in-memory fakes of the persistence ports.
class FakeCategoryRepo implements CategoryRepository {
  store = new Map<string, Category>()
  list(): Promise<Category[]> {
    return Promise.resolve([...this.store.values()])
  }
  get(id: string): Promise<Category | null> {
    return Promise.resolve(this.store.get(id) ?? null)
  }
  save(category: Category): Promise<void> {
    this.store.set(category.id, category)
    return Promise.resolve()
  }
  delete(id: string): Promise<void> {
    this.store.delete(id)
    return Promise.resolve()
  }
}

class FakeRecipeRepo implements RecipeRepository {
  store = new Map<string, Recipe>()
  constructor(recipes: Recipe[] = []) {
    recipes.forEach((r) => this.store.set(r.id, r))
  }
  list(): Promise<Recipe[]> {
    return Promise.resolve([...this.store.values()])
  }
  get(id: string): Promise<Recipe | null> {
    return Promise.resolve(this.store.get(id) ?? null)
  }
  save(recipe: Recipe): Promise<void> {
    this.store.set(recipe.id, recipe)
    return Promise.resolve()
  }
  delete(id: string): Promise<void> {
    this.store.delete(id)
    return Promise.resolve()
  }
}

function recipeWith(title: string, category: string): Recipe {
  return Recipe.create({ title, ingredients: [], steps: [], notes: [], category })
}

test('create then list returns the new category', async () => {
  const service = new CategoryService(new FakeCategoryRepo(), new FakeRecipeRepo())
  const created = await service.create('Hoofdgerecht')
  const all = await service.list()
  assert.equal(all.length, 1)
  assert.equal(all[0].id, created.id)
  assert.equal(all[0].name, 'Hoofdgerecht')
})

test('rename cascades the new name onto recipes that used the old one', async () => {
  const categories = new FakeCategoryRepo()
  const main = await new CategoryService(categories, new FakeRecipeRepo()).create('Main')

  const a = recipeWith('A', 'Main')
  const b = recipeWith('B', 'Main')
  const c = recipeWith('C', 'Salades')
  const recipes = new FakeRecipeRepo([a, b, c])

  const service = new CategoryService(categories, recipes)
  await service.update(main.id, { name: 'Hoofdgerecht' })

  assert.equal((await recipes.get(a.id))!.category, 'Hoofdgerecht')
  assert.equal((await recipes.get(b.id))!.category, 'Hoofdgerecht')
  // A recipe in a different category is untouched.
  assert.equal((await recipes.get(c.id))!.category, 'Salades')
  // The category entity itself is renamed.
  assert.equal((await service.getOrThrow(main.id)).name, 'Hoofdgerecht')
})

test("delete removes the category but keeps recipes' category text", async () => {
  const categories = new FakeCategoryRepo()
  const main = await new CategoryService(categories, new FakeRecipeRepo()).create('Main')

  const a = recipeWith('A', 'Main')
  const recipes = new FakeRecipeRepo([a])

  const service = new CategoryService(categories, recipes)
  await service.delete(main.id)

  assert.deepEqual(await service.list(), [])
  assert.equal((await recipes.get(a.id))!.category, 'Main')
})

test('getOrThrow throws NotFoundError for an unknown id', async () => {
  const service = new CategoryService(new FakeCategoryRepo(), new FakeRecipeRepo())
  await assert.rejects(() => service.getOrThrow('missing'), NotFoundError)
})
