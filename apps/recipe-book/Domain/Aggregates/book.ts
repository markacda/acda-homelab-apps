import { randomUUID } from "node:crypto";
import { ValidationError } from "../Exceptions/validation-error.ts";

// The Book aggregate: a named, ordered list of references into the recipe
// library. Order is the page order; stale ids are tolerated at render time
// (resolved against the recipe repository, skipping any that no longer exist).

/** The persisted shape of a book (what the JSON store reads and writes). */
export interface BookData {
  id: string;
  name: string;
  /** Ordered recipe ids; order is the page order. */
  recipeIds: string[];
  createdAt: string;
  updatedAt: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function requireName(name: string | undefined): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) throw new ValidationError("A book name is required.");
  return name as string;
}

export class Book {
  readonly id: string;
  name: string;
  recipeIds: string[];
  readonly createdAt: string;
  updatedAt: string;

  constructor(data: BookData) {
    this.id = data.id;
    this.name = data.name;
    this.recipeIds = data.recipeIds;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
  }

  static create(name: string): Book {
    const ts = nowIso();
    return new Book({
      id: randomUUID(),
      name: requireName(name),
      recipeIds: [],
      createdAt: ts,
      updatedAt: ts,
    });
  }

  static fromJSON(data: BookData): Book {
    return new Book(data);
  }

  rename(name: string): void {
    this.name = requireName(name);
    this.touch();
  }

  /** Replace the ordered recipe id list (used for reorder / add / remove). */
  setRecipeIds(recipeIds: string[]): void {
    this.recipeIds = recipeIds;
    this.touch();
  }

  touch(): void {
    this.updatedAt = nowIso();
  }

  toJSON(): BookData {
    return {
      id: this.id,
      name: this.name,
      recipeIds: this.recipeIds,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
