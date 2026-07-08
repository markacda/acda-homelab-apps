import type { Category } from "../../Aggregates/category.ts";

/** Persistence port for the Category aggregate. Implemented in the Adapters layer. */
export interface CategoryRepository {
  /** All categories, newest-updated first. */
  list(): Promise<Category[]>;
  get(id: string): Promise<Category | null>;
  save(category: Category): Promise<void>;
  delete(id: string): Promise<void>;
}
