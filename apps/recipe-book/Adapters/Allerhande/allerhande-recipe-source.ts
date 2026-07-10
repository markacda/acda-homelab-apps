import type { RecipeSource, ParsedRecipe } from '../../Ports/Allerhande/recipe-source.ts'
import { BROWSER_UA } from '../browser-user-agent.ts'
import { parseRecipe } from './parse.ts'

/**
 * Rewrite Allerhande's short recipe URL to the canonical recipe page. AH shares
 * links like `https://www.ah.nl/r/480288`, but those 404 when fetched directly;
 * the recipe page lives at `https://www.ah.nl/allerhande/recept/r-480288`. The
 * canonical form (and any non-matching URL) is returned unchanged.
 */
export function normalizeAllerhandeUrl(url: string): string {
  const match = /^(https?:\/\/(?:www\.)?ah\.nl)\/r\/(\d+)\/?$/i.exec(url.trim())
  return match ? `${match[1]}/allerhande/recept/r-${match[2]}` : url
}

/**
 * RecipeSource backed by Albert Heijn's Allerhande site: fetch the recipe page's
 * HTML (with browser-like headers, since AH's CDN challenges obvious bots) and
 * extract its schema.org JSON-LD.
 */
export class AllerhandeRecipeSource implements RecipeSource {
  async fetch(url: string): Promise<ParsedRecipe | null> {
    const html = await this.fetchHtml(normalizeAllerhandeUrl(url))
    return parseRecipe(html)
  }

  private async fetchHtml(url: string): Promise<string> {
    const res = await fetch(url, {
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
    })
    if (!res.ok) {
      throw new Error(`Could not fetch recipe page (HTTP ${res.status}).`)
    }
    return res.text()
  }
}
