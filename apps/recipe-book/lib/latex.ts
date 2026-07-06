import type { Recipe, Book } from "./types.ts";

// Pure LaTeX rendering: turn a book + its resolved recipes into a .tex document
// by filling placeholder tokens in the (user-owned) templates. No filesystem
// access here so it can be unit-tested; generate.ts loads the template files and
// runs Tectonic.

export interface Templates {
  /** Document skeleton with a {{bookTitle}} token and a %%RECIPES%% marker. */
  book: string;
  /** Per-recipe block with {{title}} {{categoryLine}} {{image}} {{ingredients}} {{steps}}. */
  recipe: string;
}

const LATEX_ESCAPES: Record<string, string> = {
  "\\": "\\textbackslash{}",
  "&": "\\&",
  "%": "\\%",
  $: "\\$",
  "#": "\\#",
  _: "\\_",
  "{": "\\{",
  "}": "\\}",
  "~": "\\textasciitilde{}",
  "^": "\\textasciicircum{}",
};

/** Escape LaTeX special characters. Single pass: injected output is not re-scanned. */
export function escapeLatex(input: string): string {
  return input.replace(/[\\&%$#_{}~^]/g, (c) => LATEX_ESCAPES[c]);
}

/** Fill {{token}} placeholders from a map (values are inserted verbatim). */
function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_all, key: string) =>
    key in values ? values[key] : "",
  );
}

function itemize(lines: string[]): string {
  return lines.map((l) => `  \\item ${escapeLatex(l)}`).join("\n");
}

/** Render a single recipe block from the recipe template. */
export function renderRecipe(recipe: Recipe, templates: Templates): string {
  const category = recipe.category?.trim();
  const categoryLine = category ? `\\textit{${escapeLatex(category)}}\\par` : "";
  // Tectonic runs with cwd = DATA_DIR, so images resolve as images/<file>.
  const image = recipe.imageFile
    ? `\\includegraphics[width=\\linewidth]{images/${recipe.imageFile}}`
    : "";
  return fill(templates.recipe, {
    title: escapeLatex(recipe.title),
    categoryLine,
    image,
    ingredients: itemize(recipe.ingredients),
    steps: itemize(recipe.steps),
  });
}

/** Render a full book document. `recipes` must already be resolved and ordered. */
export function renderBook(book: Book, recipes: Recipe[], templates: Templates): string {
  const body = recipes.map((r) => renderRecipe(r, templates)).join("\n\n");
  return fill(templates.book, { bookTitle: escapeLatex(book.name) }).replace("%%RECIPES%%", body);
}
