// Parse a Turbo.az search page into short listing cards.

export interface ListingCard {
  id: string;
  url: string;
  name: string;
  price: number | null;
  currency: string | null;
  year: number | null;
  engine: string | null;
  mileageKm: number | null;
  place: string | null;
  photo: string | null;
}

export interface ListPage {
  cards: ListingCard[];
  nextUrl: string | null;
}

interface RawCard {
  id: string;
  href: string;
  name: string;
  price: string;
  attributes: string;
  datetime: string;
  photo: string | null;
}

export async function parseListPage(res: Response, pageUrl: URL): Promise<ListPage> {
  const raw: RawCard[] = [];
  let current: RawCard | null = null;
  let nextHref: string | null = null;

  // Collects the text of an element into one field of the current card.
  const textInto = (field: "name" | "price" | "attributes" | "datetime") => ({
    text(chunk: Text) {
      if (current) current[field] += chunk.text;
    },
  });

  await new HTMLRewriter()
    .on(".products-i[data-ad-id]", {
      element(el) {
        current = { id: el.getAttribute("data-ad-id") ?? "", href: "", name: "", price: "", attributes: "", datetime: "", photo: null };
        raw.push(current);
      },
    })
    .on(".products-i a.products-i__link", {
      element(el) {
        if (current) current.href = decodeEntities(el.getAttribute("href") ?? "");
      },
    })
    .on(".products-i .products-i__top img", {
      element(el) {
        if (current && !current.photo) current.photo = decodeEntities(el.getAttribute("src") ?? "") || null;
      },
    })
    .on(".products-i .products-i__name", textInto("name"))
    .on(".products-i .products-i__price", textInto("price"))
    .on(".products-i .products-i__attributes", textInto("attributes"))
    .on(".products-i .products-i__datetime", textInto("datetime"))
    .on(".pagination .next a[rel=next]", {
      element(el) {
        const href = el.getAttribute("href");
        nextHref = href ? decodeEntities(href) : null;
      },
    })
    .transform(res)
    .arrayBuffer();

  // The same ad can appear twice (VIP block + main list): keep one.
  const seen = new Set<string>();
  const cards: ListingCard[] = [];
  for (const r of raw) {
    if (!r.id || !r.href || seen.has(r.id)) continue;
    seen.add(r.id);
    const price = parsePrice(r.price);
    const attrs = parseAttributes(r.attributes);
    cards.push({
      id: r.id,
      url: new URL(r.href, pageUrl).toString(),
      name: clean(r.name),
      price: price.amount,
      currency: price.currency,
      year: attrs.year,
      engine: attrs.engine,
      mileageKm: attrs.mileageKm,
      place: clean(r.datetime) || null,
      photo: r.photo,
    });
  }

  return {
    cards,
    nextUrl: nextHref ? new URL(nextHref, pageUrl).toString() : null,
  };
}

export function clean(s: string): string {
  return decodeEntities(s).replace(/\s+/g, " ").trim();
}

// HTMLRewriter gives raw HTML: "&amp;" stays "&amp;". Decode it.
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, e: string) => {
    const k = e.toLowerCase();
    if (k.startsWith("#x")) return String.fromCodePoint(parseInt(k.slice(2), 16));
    if (k.startsWith("#")) return String.fromCodePoint(parseInt(k.slice(1), 10));
    return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " } as Record<string, string>)[k];
  });
}

// "4 200 ₼" -> { amount: 4200, currency: "₼" }
export function parsePrice(s: string): { amount: number | null; currency: string | null } {
  const text = clean(s);
  const digits = text.replace(/[^\d]/g, "");
  const currency = text.replace(/[\d\s]/g, "") || null;
  return { amount: digits ? Number(digits) : null, currency };
}

// "1992, 2.0 л, 250 396 км" -> year, engine, mileage
function parseAttributes(s: string): { year: number | null; engine: string | null; mileageKm: number | null } {
  const parts = clean(s).split(",").map((p) => p.trim());
  const yearPart = parts.find((p) => /^\d{4}$/.test(p));
  const enginePart = parts.find((p) => /л$/.test(p));
  const kmPart = parts.find((p) => /км$/.test(p));
  return {
    year: yearPart ? Number(yearPart) : null,
    engine: enginePart ?? null,
    mileageKm: kmPart ? Number(kmPart.replace(/[^\d]/g, "")) : null,
  };
}
