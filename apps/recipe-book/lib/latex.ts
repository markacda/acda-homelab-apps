import type { Recipe, Book } from "./types.ts";

// Pure LaTeX rendering: turn a book + its resolved recipes into a .tex document
// by filling placeholder tokens in the (user-owned) templates. No filesystem
// access here so it can be unit-tested; generate.ts loads the template files,
// supplies the absolute font/image paths, and runs Tectonic.

export interface Templates {
  /** Document skeleton with {{fontDir}} + {{bookTitle}} tokens and a %%RECIPES%% marker. */
  book: string;
  /** Per-recipe block (see templates/recipe.tex for its tokens). */
  recipe: string;
}

/** Absolute paths injected at generation time so LaTeX resolves them regardless of cwd. */
export interface RenderPaths {
  /** Directory holding the bundled TTFs (fontspec Path=), with a trailing slash. */
  fontDir: string;
  /** Directory holding downloaded recipe images. */
  imagesDir: string;
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
  return lines.map((l) => `    \\item ${escapeLatex(l)}`).join("\n");
}

function includegraphics(imagesDir: string, file: string): string {
  // imagesDir is absolute with forward slashes; braces around the path let it
  // contain characters graphicx would otherwise choke on.
  return `\\includegraphics[width=\\linewidth]{${imagesDir}/${file}}`;
}

/** Render a single recipe block from the recipe template. */
export function renderRecipe(recipe: Recipe, templates: Templates, paths: RenderPaths): string {
  const [titleFile, ...extraFiles] = recipe.images;

  const notesBlock =
    recipe.notes.length > 0
      ? [
          "\\vspace{0.5cm}",
          "\\uppercase{\\textbf{Notities}}",
          "\\vspace{0.25cm}",
          "\\begin{itemize}",
          "    \\setlength\\itemsep{1em}",
          itemize(recipe.notes),
          "\\end{itemize}",
        ].join("\n")
      : "";

  const extraImages =
    extraFiles.length > 0
      ? "\\newpage\n" +
        extraFiles
          .map((f) => `${includegraphics(paths.imagesDir, f)}\n\\hspace{1cm}\\newline`)
          .join("\n")
      : "";

  return fill(templates.recipe, {
    category: recipe.category ? escapeLatex(recipe.category) : "",
    title: escapeLatex(recipe.title),
    servings: recipe.servings ? escapeLatex(recipe.servings) : "",
    ingredients: itemize(recipe.ingredients),
    notesBlock,
    extraImages,
    prepTime: recipe.prepTime ? escapeLatex(recipe.prepTime) : "",
    cookTime: recipe.cookTime ? escapeLatex(recipe.cookTime) : "",
    totalTime: recipe.totalTime ? escapeLatex(recipe.totalTime) : "",
    titleImage: titleFile ? includegraphics(paths.imagesDir, titleFile) : "",
    steps: itemize(recipe.steps),
  });
}

/** A recipe's category, normalized for grouping; blank categories fall under "Overig". */
function groupKey(recipe: Recipe): string {
  return recipe.category?.trim() || "Overig";
}

/**
 * Render a full book document. `recipes` must already be resolved and ordered.
 * Recipes are grouped into \section blocks by category (in first-appearance
 * order), each recipe becoming a \subsection — giving a course-based table of
 * contents like the original hand-built book.
 */
export function renderBook(
  book: Book,
  recipes: Recipe[],
  templates: Templates,
  paths: RenderPaths,
): string {
  const order: string[] = [];
  const byCategory = new Map<string, Recipe[]>();
  for (const recipe of recipes) {
    const key = groupKey(recipe);
    if (!byCategory.has(key)) {
      byCategory.set(key, []);
      order.push(key);
    }
    byCategory.get(key)!.push(recipe);
  }

  const body = order
    .map((key) => {
      const section = `\\newpage\n\\section{${escapeLatex(key)}}`;
      const pages = byCategory
        .get(key)!
        .map((r) => renderRecipe(r, templates, paths))
        .join("\n\n");
      return `${section}\n\n${pages}`;
    })
    .join("\n\n");

  return fill(templates.book, {
    bookTitle: escapeLatex(book.name),
    fontDir: paths.fontDir,
  }).replace("%%RECIPES%%", body);
}
