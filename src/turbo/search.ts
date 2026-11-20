// Walk all pages of one Turbo.az search.

import { checkTurboUrl, fetchTurbo } from "./fetch";
import { parseListPage, type ListingCard } from "./parse-list";

const MAX_PAGES = 5;
const PAUSE_MS = 1500;

export async function runSearch(searchUrl: string): Promise<{ cards: ListingCard[]; pages: number }> {
  let url: URL | null = checkTurboUrl(searchUrl);
  const cards: ListingCard[] = [];
  const seen = new Set<string>();
  let pages = 0;

  while (url && pages < MAX_PAGES) {
    if (pages > 0) await sleep(PAUSE_MS);
    const page = await parseListPage(await fetchTurbo(url), url);
    pages++;
    for (const c of page.cards) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        cards.push(c);
      }
    }
    url = page.nextUrl ? checkTurboUrl(page.nextUrl) : null;
  }
  return { cards, pages };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
