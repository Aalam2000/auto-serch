// Cheap checks that need no AI. List stage: what the search card shows.

import type { ListingCard } from "../turbo/parse-list";

export interface EngineRule {
  label: string;
  fuel: string;
  liters: number[];
  yearFrom?: number;
  namePattern?: string; // rule applies only to these names
}

export interface FilterSettings {
  maxPrice: number;
  currency: string;
  maxDistanceKm: number;
  namePattern: string;
  listLiters: number[];
  engines: EngineRule[];
}

// Returns null if the card passes, otherwise the reason.
export function checkCard(card: ListingCard, f: FilterSettings, distanceKm: number | null): string | null {
  if (!new RegExp(f.namePattern).test(card.name)) return `модель не та: ${card.name}`;
  if (card.currency !== f.currency) return `цена не в ${f.currency} (${card.currency ?? "?"})`;
  if (card.price === null || card.price > f.maxPrice) return `цена ${card.price ?? "?"} > ${f.maxPrice}`;
  const liters = litersOf(card.engine);
  if (liters === null || !f.listLiters.includes(liters)) return `объём ${card.engine ?? "?"} не подходит`;
  if (cityOf(card.place) === "На заказ") return "на заказ";
  if (distanceKm !== null && distanceKm > f.maxDistanceKm) return `далеко: ${distanceKm} км`;
  return null;
}

// Ad page stage: fuel is known there.
export function checkEngine(
  name: string,
  fuel: string,
  liters: number | null,
  year: number | null,
  f: FilterSettings,
): string | null {
  const ok = f.engines.some(
    (r) =>
      (r.namePattern === undefined || new RegExp(r.namePattern).test(name)) &&
      fuel.includes(r.fuel) &&
      liters !== null &&
      r.liters.includes(liters) &&
      (r.yearFrom === undefined || (year !== null && year >= r.yearFrom)),
  );
  return ok ? null : `мотор не подходит: ${name}, ${liters ?? "?"} л, ${fuel}, ${year ?? "?"}`;
}

export function litersOf(engine: string | null): number | null {
  const m = engine?.match(/(\d+(?:\.\d+)?)\s*л/);
  return m ? Number(m[1]) : null;
}

// "Баку, сегодня 01:26" -> "Баку"
export function cityOf(place: string | null): string | null {
  const city = place?.split(",")[0]?.trim();
  return city || null;
}
