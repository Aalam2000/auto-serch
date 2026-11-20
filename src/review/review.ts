// Review job: take a few 'new' ads, open their page, check the engine,
// then let the AI look at the text and all photos.

import { Buffer } from "node:buffer";
import type { Env } from "../env";
import { reviewWithGemini, type Photo } from "../ai/gemini";
import { checkTurboUrl, fetchTurbo } from "../turbo/fetch";
import { parseAdPage, type AdDetails } from "../turbo/parse-ad";
import { checkEngine, litersOf } from "../scan/filter";
import { loadFilter } from "../scan/scan";

interface AiSettings {
  model: string;
  adsPerRun: number;
  maxPhotos: number;
}

interface AdRow {
  id: string;
  url: string;
  name: string;
  year: number | null;
  price: number | null;
  city: string | null;
  distance_km: number | null;
}

export interface ReviewResult {
  checked: number;
  filteredOut: number;
  reviewed: number;
  errors: string[];
}

export async function reviewNew(env: Env): Promise<ReviewResult> {
  const result: ReviewResult = { checked: 0, filteredOut: 0, reviewed: 0, errors: [] };
  const ai = await loadJson<AiSettings>(env, "ai");
  const prompt = await loadText(env, "prompt");
  const filter = await loadFilter(env);

  const { results: ads } = await env.DB.prepare(
    "SELECT id, url, name, year, price, city, distance_km FROM ads WHERE status = 'new' ORDER BY first_seen LIMIT ?",
  ).bind(ai.adsPerRun).all<AdRow>();

  for (const ad of ads) {
    result.checked++;
    try {
      const url = checkTurboUrl(ad.url);
      const details = await parseAdPage(await fetchTurbo(url), url);
      const engine = details.properties["Двигатель"] ?? "";
      const fuel = engine.split("/").map((s) => s.trim()).pop() ?? "";
      const credit = /kredit|кредит/i.test(details.description) ? 1 : 0;

      await env.DB.prepare("UPDATE ads SET fuel = ?, credit = ?, photos = ? WHERE id = ?")
        .bind(fuel, credit, JSON.stringify(details.photos), ad.id).run();

      const reason = checkEngine(ad.name, fuel, litersOf(engine), ad.year, filter);
      if (reason) {
        await setStatus(env, ad.id, "filtered_out", reason);
        result.filteredOut++;
        continue;
      }

      const photos = await loadPhotos(details.photos.slice(0, ai.maxPhotos));
      const review = await reviewWithGemini(env.GEMINI_API_KEY, ai.model, buildPrompt(prompt, ad, details), photos);

      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO reviews (ad_id, body_score, rust_score, accident_signs, interior_score, has_ac,
                                real_mileage_note, total_score, summary, ai_model, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          ad.id, review.body_score, review.rust_score, review.accident_signs, review.interior_score,
          review.has_ac === null ? null : review.has_ac ? 1 : 0,
          `${review.real_mileage_note}\nМотор: ${review.engine_note}`,
          review.total_score, review.summary, ai.model, new Date().toISOString(),
        ),
        env.DB.prepare("UPDATE ads SET status = 'reviewed', status_reason = NULL, credit = MAX(credit, ?) WHERE id = ?")
          .bind(review.credit_possible ? 1 : 0, ad.id),
      ]);
      result.reviewed++;
    } catch (e) {
      // Leave the ad as 'new' so the next run tries again.
      result.errors.push(`${ad.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return result;
}

function buildPrompt(prompt: string, ad: AdRow, d: AdDetails): string {
  const props = Object.entries(d.properties).map(([k, v]) => `${k}: ${v}`).join("\n");
  return `${prompt}

--- Объявление ---
${ad.name}, цена ${ad.price ?? "?"} ₼, город ${ad.city ?? "?"} (${ad.distance_km ?? "?"} км от Баку)
${props}

Текст продавца:
${d.description || "(нет текста)"}

Фото: ${d.photos.length} шт., ниже по порядку.`;
}

async function loadPhotos(urls: string[]): Promise<Photo[]> {
  const photos: Photo[] = [];
  for (const u of urls) {
    const res = await fetch(u);
    if (!res.ok) continue;
    photos.push({
      mime: res.headers.get("content-type") ?? "image/jpeg",
      base64: Buffer.from(await res.arrayBuffer()).toString("base64"),
    });
  }
  return photos;
}

async function setStatus(env: Env, id: string, status: string, reason: string | null): Promise<void> {
  await env.DB.prepare("UPDATE ads SET status = ?, status_reason = ? WHERE id = ?").bind(status, reason, id).run();
}

async function loadText(env: Env, key: string): Promise<string> {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first<{ value: string }>();
  if (!row) throw new Error(`settings '${key}' is missing`);
  return row.value;
}

async function loadJson<T>(env: Env, key: string): Promise<T> {
  return JSON.parse(await loadText(env, key)) as T;
}
