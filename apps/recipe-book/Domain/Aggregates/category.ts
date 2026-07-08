import { randomUUID } from "node:crypto";
import { ValidationError } from "../Exceptions/validation-error.ts";

// The Category aggregate: a managed name used to group recipes (courses like
// "Hoofdgerecht", "Salades"). Recipes reference a category by its name string,
// so renaming a category cascades to the recipes that use it (handled in the
// application service); the LaTeX generator groups recipes by that same name.

/** The persisted shape of a category (what the JSON store reads and writes). */
export interface CategoryData {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function requireName(name: string | undefined): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) throw new ValidationError("A category name is required.");
  return trimmed;
}

export class Category {
  readonly id: string;
  name: string;
  readonly createdAt: string;
  updatedAt: string;

  constructor(data: CategoryData) {
    this.id = data.id;
    this.name = data.name;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
  }

  static create(name: string): Category {
    const ts = nowIso();
    return new Category({
      id: randomUUID(),
      name: requireName(name),
      createdAt: ts,
      updatedAt: ts,
    });
  }

  static fromJSON(data: CategoryData): Category {
    return new Category(data);
  }

  rename(name: string): void {
    this.name = requireName(name);
    this.touch();
  }

  touch(): void {
    this.updatedAt = nowIso();
  }

  toJSON(): CategoryData {
    return {
      id: this.id,
      name: this.name,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
