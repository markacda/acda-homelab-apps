// A realistic browser User-Agent, sent on outgoing fetches to Allerhande (page
// HTML and recipe images). AH sits behind a CDN that challenges obvious bots, so
// browser-like headers lift some gates. Shared by the Allerhande and image-store
// adapters, both of which fetch from that CDN.
export const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36'
