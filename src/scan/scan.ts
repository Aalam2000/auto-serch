// Cron job: run every enabled search, store new ads, track prices.

import type { Env } from "../env";
import { runSearch } from "../turbo/search";
import type { ListingCard } from "../turbo/parse-list";
import { checkCard, cityOf, type FilterSettings } from "./filter";

export interface ScanResult {
  searches: number;
  seen: number;
  added: number;
  passed: number;
  priceChanged: number;
  errors: string[];
}

export async function scanAll(env: Env): Promise<ScanResult> {
  const result: ScanResult = { searches: 0, seen: 0, added: 0, passed: 0, priceChanged: 0, errors: [] };
  const filter = await loadFilter(env);
  const cities = await loadCities(env);
  const { results: searches } = await env.DB.prepare(
    "SELECT id, url FROM searches WHERE enabled = 1",
  ).all<{ id: number; url: string }>();

  for (const s of searches) {
    const now = new Date().toISOString();
    try {
      const { cards } = await runSearch(s.url);
      result.searches++;
      for (const card of cards) {
        result.seen++;
        await saveCard(env, s.id, card, filter, cities, now, result);
      }
      await env.DB.prepare("UPDATE searches SET last_run = ?, last_error = NULL WHERE id = ?").bind(now, s.id).run();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result.errors.push(`search ${s.id}: ${msg}`);
      await env.DB.prepare("UPDATE searches SET last_run = ?, last_error = ? WHERE id = ?").bind(now, msg, s.id).run();
    }
  }
  return result;
}

async function saveCard(
  env: Env,
  searchId: number,
  card: ListingCard,
  filter: FilterSettings,
  cities: Map<string, number>,
  now: string,
  result: ScanResult,
): Promise<void> {
  const existing = await env.DB.prepare("SELECT price FROM ads WHERE id = ?")
    .bind(card.id)
    .first<{ price: number | null }>();

  if (existing) {
    const stmts = [env.DB.prepare("UPDATE ads SET last_seen = ?, price = ? WHERE id = ?").bind(now, card.price, card.id)];
    if (card.price !== null && card.price !== existing.price) {
      stmts.push(env.DB.prepare("INSERT INTO price_history (ad_id, price, seen_at) VALUES (?, ?, ?)").bind(card.id, card.price, now));
      result.priceChanged++;
    }
    await env.DB.batch(stmts);
    return;
  }

  const city = cityOf(card.place);
  const distance = city !== null ? cities.get(city) ?? null : null;
  const reason = checkCard(card, filter, distance);
  const status = reason ? "filtered_out" : "new";

  const stmts = [
    env.DB.prepare(
      `INSERT INTO ads (id, url, search_id, name, engine, year, mileage_km, price, currency,
                        city, distance_km, photo, status, status_reason, first_seen, last_seen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      card.id, card.url, searchId, card.name, card.engine, card.year, card.mileageKm, card.price, card.currency,
      city, distance, card.photo, status, reason, now, now,
    ),
  ];
  if (card.price !== null) {
    stmts.push(env.DB.prepare("INSERT INTO price_history (ad_id, price, seen_at) VALUES (?, ?, ?)").bind(card.id, card.price, now));
  }
  await env.DB.batch(stmts);
  result.added++;
  if (!reason) result.passed++;
}

export async function loadFilter(env: Env): Promise<FilterSettings> {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'filter'").first<{ value: string }>();
  if (!row) throw new Error("settings 'filter' is missing");
  return JSON.parse(row.value) as FilterSettings;
}

async function loadCities(env: Env): Promise<Map<string, number>> {
  const { results } = await env.DB.prepare("SELECT name, distance_km FROM cities").all<{ name: string; distance_km: number }>();
  return new Map(results.map((r) => [r.name, r.distance_km]));
}
