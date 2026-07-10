// Port for the external recipe provider (Albert Heijn / Allerhande). Kept out of
// Domain because it models an outside system, not a domain rule; the Adapters
// layer implements it (fetch the page + extract its schema.org JSON-LD).

/** A recipe extracted from an external page, before it becomes a Recipe aggregate. */
export interface ParsedRecipe {
  title: string
  imageUrl: string | null
  ingredients: string[]
  steps: string[]
  servings?: string
  prepTime?: string
  cookTime?: string
  totalTime?: string
  category?: string
}

export interface RecipeSource {
  /**
   * Fetch a recipe page and extract its structured data. Returns null when the
   * page has no parseable recipe (caller falls back to manual entry); throws
   * when the page itself cannot be fetched.
   */
  fetch(url: string): Promise<ParsedRecipe | null>
}
