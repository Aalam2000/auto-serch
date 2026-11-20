// Parse one Turbo.az ad page: properties, description, price, photos.

import { clean, decodeEntities, parsePrice } from "./parse-list";

export interface AdDetails {
  id: string;
  url: string;
  price: number | null;
  currency: string | null;
  properties: Record<string, string>;
  description: string;
  photos: string[];
  views: number | null;
  updated: string | null;
}

export async function parseAdPage(res: Response, adUrl: URL): Promise<AdDetails> {
  const properties: Record<string, string> = {};
  const photos: string[] = [];
  const stats: string[] = [];
  let propName = "";
  let propValue = "";
  let description = "";
  let price = "";
  let priceDone = false;
  let stat = "";

  await new HTMLRewriter()
    .on(".product-properties__i", {
      element(el) {
        // Save the previous pair, start a new one.
        if (propName) properties[clean(propName)] = clean(propValue);
        propName = "";
        propValue = "";
        el.onEndTag(() => {
          if (propName) properties[clean(propName)] = clean(propValue);
          propName = "";
          propValue = "";
        });
      },
    })
    .on(".product-properties__i-name", { text: (t) => { propName += t.text; } })
    .on(".product-properties__i-value", { text: (t) => { propValue += t.text; } })
    .on(".product-description__content", {
      text: (t) => { description += t.text; },
    })
    .on(".product-description__content br, .product-description__content p", {
      element() {
        description += "\n";
      },
    })
    .on(".product-price__i--bold", {
      element(el) {
        if (price) priceDone = true;
        el.onEndTag(() => { priceDone = true; });
      },
      text: (t) => { if (!priceDone) price += t.text; },
    })
    .on(".product-photos img", {
      element(el) {
        const rawSrc = el.getAttribute("src") ?? el.getAttribute("data-src");
        const src = rawSrc ? decodeEntities(rawSrc) : null;
        if (src && src.includes("/uploads/f660x496/") && !photos.includes(src)) photos.push(src);
      },
    })
    .on(".product-statistics__i-text", {
      element(el) {
        el.onEndTag(() => { stats.push(clean(stat)); stat = ""; });
      },
      text: (t) => { stat += t.text; },
    })
    .transform(res)
    .arrayBuffer();

  const p = parsePrice(price);
  const viewsLine = stats.find((s) => /просмотр|baxış/i.test(s));
  const updatedLine = stats.find((s) => /обновлено|yeniləndi/i.test(s));

  return {
    id: adUrl.pathname.match(/\/autos\/(\d+)/)?.[1] ?? "",
    url: adUrl.toString(),
    price: p.amount,
    currency: p.currency,
    properties,
    description: decodeEntities(description).replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim(),
    photos,
    views: viewsLine ? Number(viewsLine.replace(/[^\d]/g, "")) : null,
    updated: updatedLine ? updatedLine.split(":").slice(1).join(":").trim() : null,
  };
}
