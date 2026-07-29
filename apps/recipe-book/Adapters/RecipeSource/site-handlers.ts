// Per-site URL normalizers. The recipe parser itself is generic (any page with
// schema.org Recipe JSON-LD works), so the only site-specific knowledge we need
// is how to turn a shared/short link into the canonical recipe page URL. Each
// handler claims the URLs it recognises and rewrites them; a default pass-through
// handler leaves everything else untouched, so a brand-new recipe site works out
// of the box as long as it embeds JSON-LD.

export interface SiteHandler {
  /** Whether this handler recognises the given URL. */
  matches(url: string): boolean;
  /** Rewrite the URL to the canonical, fetchable recipe page. */
  normalizeUrl(url: string): string;
}

/**
 * Albert Heijn / Allerhande shares links like `https://www.ah.nl/r/480288`, but
 * those 404 when fetched directly; the recipe page lives at
 * `https://www.ah.nl/allerhande/recept/r-480288`.
 */
const AH_SHORT_LINK = /^(https?:\/\/(?:www\.)?ah\.nl)\/r\/(\d+)\/?$/i;

export function normalizeAllerhandeUrl(url: string): string {
  const match = AH_SHORT_LINK.exec(url.trim());
  return match ? `${match[1]}/allerhande/recept/r-${match[2]}` : url;
}

const allerhandeHandler: SiteHandler = {
  matches: (url) => AH_SHORT_LINK.test(url.trim()),
  normalizeUrl: normalizeAllerhandeUrl,
};

/** Registry of site handlers, tried in order. Add a new site's quirks here. */
export const siteHandlers: readonly SiteHandler[] = [allerhandeHandler];

/**
 * Normalize a recipe URL for fetching by applying the first matching site
 * handler; URLs no handler claims are returned unchanged (after trimming).
 */
export function normalizeSourceUrl(url: string): string {
  const trimmed = url.trim();
  const handler = siteHandlers.find((h) => h.matches(trimmed));
  return handler ? handler.normalizeUrl(trimmed) : trimmed;
}
