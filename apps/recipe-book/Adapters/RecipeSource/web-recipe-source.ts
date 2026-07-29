import type { RecipeSource, ParsedRecipe } from '../../Ports/RecipeSource/recipe-source.ts';
import { BROWSER_UA } from '../browser-user-agent.ts';
import { normalizeSourceUrl } from './site-handlers.ts';
import { parseRecipe } from './parse.ts';

/**
 * Reads a recipe from any recipe website: it fetches the page and extracts the
 * structured recipe data (schema.org) the page embeds. The URL is first run
 * through the per-site handler registry (e.g. Allerhande short links), then
 * fetched with browser-like headers (many sites sit behind a CDN that challenges
 * obvious bots).
 *
 * Expected to work with Allerhande/AH plus common recipe blogs (Leukerecepten,
 * Kookmutsjes, Laura's Bakery, Miljuschka, Verse Oogst, Proef Japan, …) as long
 * as they embed schema.org Recipe JSON-LD.
 */
export class WebRecipeSource implements RecipeSource {
  async fetch(url: string): Promise<ParsedRecipe | null> {
    const html = await this.fetchHtml(normalizeSourceUrl(url));
    return parseRecipe(html);
  }

  private async fetchHtml(url: string): Promise<string> {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      throw new Error('Recipe URL must start with http:// or https://.');
    }
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
      throw new Error('Recipe URL must not point to localhost.');
    }

    const res = await fetch(u.toString(), {
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      throw new Error(`Could not fetch recipe page (HTTP ${res.status}).`);
    }
    return await res.text();
  }
}
