import { randomUUID } from "node:crypto";
import { ValidationError } from "../Exceptions/validation-error.ts";

// The Recipe aggregate: a single recipe in the shared library, plus the
// invariants that were previously scattered across server.ts and lib/store.ts
// (a title is always required; the image gallery is an ordered subset of the
// files actually held for the recipe). Persistence lives in the JsonFileStore
// adapter, which (de)serializes via fromJSON/toJSON.

/** The editable field set accepted when creating or patching a recipe. */
export interface RecipeContent {
  title: string;
  /** Source Allerhande URL, or null when created/entered manually. */
  sourceUrl?: string | null;
  /** Original remote image URL (kept for reference/re-download), or null. */
  imageUrl?: string | null;
  ingredients: string[];
  steps: string[];
  /** Number of servings, as a bare number string (the "personen" unit is added at render time). */
  servings?: string;
  /** Durations in minutes, as bare number strings (the "min" unit is added at render time). */
  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
  /** Manual free-text notes ("Notities"); not sourced from Allerhande. */
  notes: string[];
  category?: string;
}

/** The persisted shape of a recipe (what the JSON store reads and writes). */
export interface RecipeData extends RecipeContent {
  id: string;
  sourceUrl: string | null;
  imageUrl: string | null;
  /**
   * Ordered local image filenames. images[0] is the title image; images[1..]
   * are extra step photos shown in the layout's gallery.
   */
  images: string[];
  createdAt: string;
  updatedAt: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function requireTitle(title: string | undefined): string {
  const trimmed = (title ?? "").trim();
  if (!trimmed) throw new ValidationError("A recipe title is required.");
  return title as string;
}

export class Recipe {
  readonly id: string;
  sourceUrl: string | null;
  title: string;
  imageUrl: string | null;
  images: string[];
  ingredients: string[];
  steps: string[];
  servings?: string;
  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
  notes: string[];
  category?: string;
  readonly createdAt: string;
  updatedAt: string;

  constructor(data: RecipeData) {
    this.id = data.id;
    this.sourceUrl = data.sourceUrl;
    this.title = data.title;
    this.imageUrl = data.imageUrl;
    this.images = data.images;
    this.ingredients = data.ingredients;
    this.steps = data.steps;
    this.servings = data.servings;
    this.prepTime = data.prepTime;
    this.cookTime = data.cookTime;
    this.totalTime = data.totalTime;
    this.notes = data.notes;
    this.category = data.category;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
  }

  /** Build a brand-new recipe from an editable field set (empty gallery). */
  static create(content: RecipeContent): Recipe {
    const ts = nowIso();
    return new Recipe({
      id: randomUUID(),
      sourceUrl: content.sourceUrl ?? null,
      title: requireTitle(content.title),
      imageUrl: content.imageUrl ?? null,
      images: [],
      ingredients: content.ingredients,
      steps: content.steps,
      servings: content.servings,
      prepTime: content.prepTime,
      cookTime: content.cookTime,
      totalTime: content.totalTime,
      notes: content.notes,
      category: content.category,
      createdAt: ts,
      updatedAt: ts,
    });
  }

  static fromJSON(data: RecipeData): Recipe {
    return new Recipe(data);
  }

  /** Apply a partial text-field edit. Only keys present in `edits` are touched. */
  applyEdits(edits: Partial<RecipeContent>): void {
    if ("title" in edits) this.title = requireTitle(edits.title);
    if ("ingredients" in edits) this.ingredients = edits.ingredients ?? [];
    if ("steps" in edits) this.steps = edits.steps ?? [];
    if ("servings" in edits) this.servings = edits.servings ?? undefined;
    if ("prepTime" in edits) this.prepTime = edits.prepTime ?? undefined;
    if ("cookTime" in edits) this.cookTime = edits.cookTime ?? undefined;
    if ("totalTime" in edits) this.totalTime = edits.totalTime ?? undefined;
    if ("notes" in edits) this.notes = edits.notes ?? [];
    if ("category" in edits) this.category = edits.category ?? undefined;
    this.touch();
  }

  /** Append a stored image filename to the end of the gallery. */
  appendImage(filename: string): void {
    this.images.push(filename);
    this.touch();
  }

  /**
   * Reorder/trim the gallery to `filenames`, which must be a permutation/subset
   * of the current images (unknown names are ignored). Returns the filenames
   * that are no longer referenced so the caller can delete their files.
   */
  reorderImages(filenames: string[]): string[] {
    const current = new Set(this.images);
    const next = filenames.filter((f) => current.has(f));
    const removed = this.images.filter((f) => !next.includes(f));
    this.images = next;
    this.touch();
    return removed;
  }

  touch(): void {
    this.updatedAt = nowIso();
  }

  toJSON(): RecipeData {
    return {
      id: this.id,
      sourceUrl: this.sourceUrl,
      title: this.title,
      imageUrl: this.imageUrl,
      images: this.images,
      ingredients: this.ingredients,
      steps: this.steps,
      servings: this.servings,
      prepTime: this.prepTime,
      cookTime: this.cookTime,
      totalTime: this.totalTime,
      notes: this.notes,
      category: this.category,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
