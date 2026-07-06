// Shared server-side domain types. The browser client defines its own mirror of
// these (it can't import across the client tsconfig's rootDir), so keep the two
// in sync when fields change.

/** A single recipe in the shared library. */
export interface Recipe {
  id: string;
  /** Source Allerhande URL, or null when created/entered manually. */
  sourceUrl: string | null;
  title: string;
  /** Original remote image URL (kept for reference/re-download), or null. */
  imageUrl: string | null;
  /** Local image filename under DATA_DIR/images (e.g. "<id>.jpg"), or null. */
  imageFile: string | null;
  ingredients: string[];
  steps: string[];
  servings?: string;
  category?: string;
  createdAt: string;
  updatedAt: string;
}

/** A recipe book: an ordered list of references into the library. */
export interface Book {
  id: string;
  name: string;
  /** Ordered recipe ids; order is the page order. Stale ids are skipped. */
  recipeIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** The editable subset of a recipe accepted by create/update endpoints. */
export interface RecipeInput {
  title: string;
  sourceUrl?: string | null;
  imageUrl?: string | null;
  ingredients: string[];
  steps: string[];
  servings?: string;
  category?: string;
}
