// Pure extraction of a schema.org Recipe from a page's JSON-LD. Allerhande (and
// most recipe sites) embed a <script type="application/ld+json"> block with the
// Recipe structured data; we parse that rather than scraping the rendered HTML,
// so no HTML-parsing dependency is needed. Everything here is side-effect free
// and unit-tested with a crafted fixture.

export interface ParsedRecipe {
  title: string;
  imageUrl: string | null;
  ingredients: string[];
  steps: string[];
  servings?: string;
  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
  category?: string;
}

/**
 * Turn an ISO-8601 duration (e.g. "PT1H15M", "PT30M", "PT2H") into a short Dutch
 * string ("1 uur 15 min", "30 min", "2 uur"), matching the recipe-book layout.
 * Returns undefined for anything it can't read.
 */
export function parseIsoDuration(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const m = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?/.exec(value.trim());
  if (!m) return undefined;
  const days = Number(m[1] || 0);
  const hours = Number(m[2] || 0) + days * 24;
  const mins = Number(m[3] || 0);
  const parts: string[] = [];
  if (hours) parts.push(`${hours} uur`);
  if (mins) parts.push(`${mins} min`);
  return parts.length ? parts.join(" ") : undefined;
}

/** Pull the contents of every <script type="application/ld+json"> block. */
export function extractJsonLdBlocks(html: string): string[] {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    out.push(m[1].trim());
  }
  return out;
}

/** Flatten a parsed JSON-LD value into a list of candidate node objects. */
function collectNodes(value: unknown): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = [];
  const visit = (v: unknown): void => {
    if (Array.isArray(v)) {
      v.forEach(visit);
    } else if (v && typeof v === "object") {
      const obj = v as Record<string, unknown>;
      nodes.push(obj);
      if (Array.isArray(obj["@graph"])) obj["@graph"].forEach(visit);
    }
  };
  visit(value);
  return nodes;
}

function hasType(node: Record<string, unknown>, type: string): boolean {
  const t = node["@type"];
  if (typeof t === "string") return t === type;
  if (Array.isArray(t)) return t.includes(type);
  return false;
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

/** Strip HTML tags and decode the handful of entities recipe text uses. */
export function stripHtml(input: string): string {
  return input
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? e)
    .replace(/\s+/g, " ")
    .trim();
}

/** Coerce schema.org `image` (string | ImageObject | array) to a single URL. */
function firstImageUrl(image: unknown): string | null {
  const pick = (v: unknown): string | null => {
    if (typeof v === "string") return v;
    if (v && typeof v === "object") {
      const url = (v as Record<string, unknown>).url;
      if (typeof url === "string") return url;
    }
    return null;
  };
  if (Array.isArray(image)) {
    for (const item of image) {
      const url = pick(item);
      if (url) return url;
    }
    return null;
  }
  return pick(image);
}

/** Normalize recipeInstructions (string | string[] | HowToStep[] | HowToSection[]) to lines. */
function normalizeInstructions(instructions: unknown): string[] {
  const steps: string[] = [];
  const pushText = (v: unknown): void => {
    if (typeof v === "string") {
      const clean = stripHtml(v);
      if (clean) steps.push(clean);
    } else if (v && typeof v === "object") {
      const obj = v as Record<string, unknown>;
      if (hasType(obj, "HowToSection") && Array.isArray(obj.itemListElement)) {
        obj.itemListElement.forEach(pushText);
      } else if (typeof obj.text === "string") {
        const clean = stripHtml(obj.text);
        if (clean) steps.push(clean);
      } else if (typeof obj.name === "string") {
        const clean = stripHtml(obj.name);
        if (clean) steps.push(clean);
      }
    }
  };

  if (typeof instructions === "string") {
    // A single blob: split on newlines or numbered markers.
    return instructions
      .split(/\r?\n+/)
      .map((s) => stripHtml(s))
      .filter(Boolean);
  }
  if (Array.isArray(instructions)) instructions.forEach(pushText);
  return steps;
}

function normalizeIngredients(ingredients: unknown): string[] {
  if (!Array.isArray(ingredients)) return [];
  return ingredients.map((i) => (typeof i === "string" ? stripHtml(i) : "")).filter(Boolean);
}

function normalizeYield(recipeYield: unknown): string | undefined {
  if (typeof recipeYield === "string") return recipeYield.trim() || undefined;
  if (typeof recipeYield === "number") return String(recipeYield);
  if (Array.isArray(recipeYield)) {
    const first = recipeYield.find((v) => typeof v === "string" || typeof v === "number");
    return first !== undefined ? String(first) : undefined;
  }
  return undefined;
}

function normalizeCategory(category: unknown): string | undefined {
  if (typeof category === "string") return category.trim() || undefined;
  if (Array.isArray(category)) {
    const first = category.find((v) => typeof v === "string");
    return typeof first === "string" ? first : undefined;
  }
  return undefined;
}

/**
 * Parse a recipe out of page HTML via its JSON-LD. Returns null if no Recipe
 * node with a usable title is present (caller then falls back to manual entry).
 */
export function parseRecipe(html: string): ParsedRecipe | null {
  for (const block of extractJsonLdBlocks(html)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block);
    } catch {
      continue; // tolerate a malformed block; try the next one
    }
    for (const node of collectNodes(parsed)) {
      if (!hasType(node, "Recipe")) continue;
      const title = typeof node.name === "string" ? stripHtml(node.name) : "";
      if (!title) continue;
      return {
        title,
        imageUrl: firstImageUrl(node.image),
        ingredients: normalizeIngredients(node.recipeIngredient),
        steps: normalizeInstructions(node.recipeInstructions),
        servings: normalizeYield(node.recipeYield),
        prepTime: parseIsoDuration(node.prepTime),
        cookTime: parseIsoDuration(node.cookTime),
        totalTime: parseIsoDuration(node.totalTime),
        category: normalizeCategory(node.recipeCategory),
      };
    }
  }
  return null;
}
