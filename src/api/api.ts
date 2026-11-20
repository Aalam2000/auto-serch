// JSON API for the Mini App. Every request must carry valid Telegram initData.

import type { Env } from "../env";
import { checkInitData } from "./auth";
import { checkTurboUrl, fetchTurbo } from "../turbo/fetch";
import { parseAdPage } from "../turbo/parse-ad";

interface RankSettings {
  pricePenaltyPer: number;    // -1 point per this many ₼
  distancePenaltyPer: number; // -1 point per this many km
}

interface TopRow {
  id: string;
  name: string;
  year: number | null;
  price: number | null;
  city: string | null;
  distance_km: number | null;
  fuel: string | null;
  credit: number;
  photo: string | null;
  url: string;
  status: string;
  total_score: number;
  has_ac: number | null;
}

export async function handleApi(request: Request, env: Env, pathname: string): Promise<Response> {
  const ok = await checkInitData(
    request.headers.get("X-Telegram-Init-Data") ?? "",
    env.TELEGRAM_BOT_TOKEN,
    env.OWNER_TG_ID,
  );
  if (!ok) return json({ error: "unauthorized" }, 401);

  if (pathname === "/api/top" && request.method === "GET") return json(await top(env));
  if (pathname === "/api/health" && request.method === "GET") return json(await health(env));

  const m = pathname.match(/^\/api\/ad\/(\d+)(\/mark)?$/);
  if (m && !m[2] && request.method === "GET") return json(await adDetails(env, m[1]));
  if (m && m[2] && request.method === "POST") {
    const { status } = (await request.json()) as { status?: string };
    if (status !== "interesting" && status !== "rejected" && status !== "sent") {
      return json({ error: "bad status" }, 400);
    }
    await env.DB.prepare("UPDATE ads SET status = ? WHERE id = ?").bind(status, m[1]).run();
    return json({ ok: true });
  }
  return json({ error: "not found" }, 404);
}

async function top(env: Env) {
  const rankRow = await env.DB.prepare("SELECT value FROM settings WHERE key = 'rank'").first<{ value: string }>();
  const rank: RankSettings = rankRow ? JSON.parse(rankRow.value) : { pricePenaltyPer: 100, distancePenaltyPer: 20 };

  const { results } = await env.DB.prepare(
    `SELECT a.id, a.name, a.year, a.price, a.city, a.distance_km, a.fuel, a.credit, a.photo, a.url, a.status,
            r.total_score, r.has_ac
       FROM ads a
       JOIN reviews r ON r.id = (SELECT MAX(id) FROM reviews WHERE ad_id = a.id)
      WHERE a.status IN ('interesting', 'sent')`,
  ).all<TopRow>();

  const ranked = results.map((a) => ({
    ...a,
    rank: Math.round(
      a.total_score -
        (a.price ?? 0) / rank.pricePenaltyPer -
        (a.distance_km ?? 300) / rank.distancePenaltyPer,
    ),
  }));
  ranked.sort((x, y) =>
    x.status === y.status ? y.rank - x.rank : x.status === "interesting" ? -1 : 1,
  );
  return { rank, ads: ranked };
}

// Lamp: green = last cron run fresh and clean, yellow = ran with errors, red = not running or Turbo.az fails.
const STALE_MIN = 40;

async function health(env: Env) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'health'").first<{ value: string }>();
  if (!row) return { lamp: "red", text: "Cron ещё ни разу не запускался" };

  const h = JSON.parse(row.value) as {
    at: string;
    scan?: { searches?: number; seen?: number; errors?: string[] };
    review?: { reviewed?: number; errors?: string[] };
    notify?: { sent?: number; errors?: string[] };
  };
  const ageMin = Math.round((Date.now() - Date.parse(h.at)) / 60000);
  const scanErrors = h.scan?.errors ?? [];
  const otherErrors = [...(h.review?.errors ?? []), ...(h.notify?.errors ?? [])];

  let lamp = "green";
  let text = `Работает. Проверка ${ageMin} мин назад, объявлений: ${h.scan?.seen ?? 0}`;
  if (ageMin > STALE_MIN) {
    lamp = "red";
    text = `Cron не запускался ${ageMin} мин`;
  } else if (scanErrors.length > 0 || (h.scan?.seen ?? 0) === 0) {
    lamp = "red";
    text = `Turbo.az не отдаёт данные: ${scanErrors[0] ?? "0 объявлений"}`;
  } else if (otherErrors.length > 0) {
    lamp = "yellow";
    text = `Поиск работает, но есть ошибки: ${otherErrors[0]}`;
  }
  return { lamp, text, at: h.at };
}

async function adDetails(env: Env, id: string) {
  const ad = await env.DB.prepare("SELECT * FROM ads WHERE id = ?").bind(id).first<Record<string, unknown>>();
  if (!ad) return { error: "not found" };

  const review = await env.DB.prepare("SELECT * FROM reviews WHERE ad_id = ? ORDER BY id DESC LIMIT 1").bind(id).first();
  const { results: prices } = await env.DB.prepare(
    "SELECT price, seen_at FROM price_history WHERE ad_id = ? ORDER BY seen_at",
  ).bind(id).all();

  // Photos are stored at review time; older ads get them on first open.
  let photos: string[] = ad.photos ? JSON.parse(String(ad.photos)) : [];
  if (photos.length === 0) {
    try {
      const url = checkTurboUrl(String(ad.url));
      photos = (await parseAdPage(await fetchTurbo(url), url)).photos;
      await env.DB.prepare("UPDATE ads SET photos = ? WHERE id = ?").bind(JSON.stringify(photos), id).run();
    } catch {
      // Ad may be gone from Turbo.az: show what we have.
    }
  }
  return { ad: { ...ad, photos }, review, prices };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
