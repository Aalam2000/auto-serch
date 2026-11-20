// Send reviewed ads that pass the score/distance rules to the owner.

import type { Env } from "../env";
import { escapeHtml, tg } from "../telegram/api";

interface Tier {
  maxKm: number;
  minScore: number;
}

interface NotifySettings {
  tiers: Tier[];
  unknownDistanceKm: number; // treat unknown city as this far
  perRun: number;
}

interface Row {
  id: string;
  url: string;
  name: string;
  year: number | null;
  price: number | null;
  city: string | null;
  distance_km: number | null;
  fuel: string | null;
  credit: number;
  photo: string | null;
  total_score: number;
  has_ac: number | null;
  summary: string;
}

export interface NotifyResult {
  sent: number;
  skipped: number;
  errors: string[];
}

export async function notifyReviewed(env: Env): Promise<NotifyResult> {
  const result: NotifyResult = { sent: 0, skipped: 0, errors: [] };
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'notify'").first<{ value: string }>();
  if (!row) throw new Error("settings 'notify' is missing");
  const s = JSON.parse(row.value) as NotifySettings;

  const { results } = await env.DB.prepare(
    `SELECT a.id, a.url, a.name, a.year, a.price, a.city, a.distance_km, a.fuel, a.credit, a.photo,
            r.total_score, r.has_ac, r.summary
       FROM ads a
       JOIN reviews r ON r.id = (SELECT MAX(id) FROM reviews WHERE ad_id = a.id)
      WHERE a.status = 'reviewed'
      ORDER BY r.total_score DESC
      LIMIT ?`,
  ).bind(s.perRun).all<Row>();

  for (const ad of results) {
    const km = ad.distance_km ?? s.unknownDistanceKm;
    const tier = s.tiers.find((t) => km <= t.maxKm);
    if (!tier || ad.total_score < tier.minScore) {
      const why = tier ? `оценка ${ad.total_score} < ${tier.minScore} для ${km} км` : `дальше ${km} км`;
      await env.DB.prepare("UPDATE ads SET status = 'skipped', status_reason = ? WHERE id = ?").bind(why, ad.id).run();
      result.skipped++;
      continue;
    }
    try {
      await sendAd(env, ad);
      await env.DB.prepare("UPDATE ads SET status = 'sent', status_reason = NULL WHERE id = ?").bind(ad.id).run();
      result.sent++;
    } catch (e) {
      result.errors.push(`${ad.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return result;
}

async function sendAd(env: Env, ad: Row): Promise<void> {
  const ac = ad.has_ac === 1 ? "есть" : ad.has_ac === 0 ? "нет" : "?";
  const lines = [
    `<b>${escapeHtml(ad.name)}</b>, ${ad.year ?? "?"}, ${escapeHtml(ad.fuel ?? "?")}`,
    `💰 <b>${ad.price ?? "?"} ₼</b>${ad.credit ? " · кредит/обмен" : ""}`,
    `📍 ${escapeHtml(ad.city ?? "?")} · ${ad.distance_km ?? "?"} км`,
    `⭐ Оценка: <b>${ad.total_score}</b>/100 · ❄️ кондиционер: ${ac}`,
    "",
    escapeHtml(ad.summary),
    "",
    `<a href="${escapeHtml(ad.url)}">Открыть на Turbo.az</a>`,
  ];
  let caption = lines.join("\n");
  if (caption.length > 1000) caption = caption.slice(0, 997) + "…";

  const keyboard = {
    inline_keyboard: [[
      { text: "👍 Интересно", callback_data: `like:${ad.id}` },
      { text: "👎 Нет", callback_data: `nope:${ad.id}` },
    ]],
  };
  const chat_id = env.OWNER_TG_ID;

  if (ad.photo) {
    await tg(env.TELEGRAM_BOT_TOKEN, "sendPhoto", { chat_id, photo: ad.photo, caption, parse_mode: "HTML", reply_markup: keyboard });
  } else {
    await tg(env.TELEGRAM_BOT_TOKEN, "sendMessage", { chat_id, text: caption, parse_mode: "HTML", reply_markup: keyboard });
  }
}
