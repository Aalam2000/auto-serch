// Worker entry.
//   cron           -> scanAll()
//   /admin/scan    -> run the scan now        (needs ?key=ADMIN_KEY)
//   /tg/webhook    -> Telegram updates (secret header)
//   /admin/review  -> review a few new ads    (needs ?key=ADMIN_KEY)
//   /admin/notify  -> send reviewed ads       (needs ?key=ADMIN_KEY)
//   /admin/setup-webhook -> point Telegram here (run on the deployed URL)
//   /admin/ads     -> last ads from the DB    (needs ?key=ADMIN_KEY)
//   /admin/search  -> parse a search link     (needs ?key=ADMIN_KEY&url=...)
//   /admin/ad      -> parse one ad link       (needs ?key=ADMIN_KEY&url=...)

import type { Env } from "./env";
import { scanAll } from "./scan/scan";
import { reviewNew } from "./review/review";
import { notifyReviewed } from "./notify/notify";
import { handleWebhook } from "./telegram/webhook";
import { tg } from "./telegram/api";
import { handleApi } from "./api/api";
import { checkTurboUrl, fetchTurbo } from "./turbo/fetch";
import { parseAdPage } from "./turbo/parse-ad";
import { runSearch } from "./turbo/search";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname, searchParams, origin } = new URL(request.url);

    if (pathname === "/tg/webhook" && request.method === "POST") {
      return handleWebhook(request, env);
    }
    if (pathname.startsWith("/api/")) {
      return handleApi(request, env, pathname);
    }

    if (pathname.startsWith("/admin/")) {
      if (!env.ADMIN_KEY || searchParams.get("key") !== env.ADMIN_KEY) {
        return new Response("Forbidden", { status: 403 });
      }
      try {
        const target = searchParams.get("url");
        switch (pathname) {
          case "/admin/scan":
            return json(await scanAll(env));
          case "/admin/review":
            return json(await reviewNew(env));
          case "/admin/notify":
            return json(await notifyReviewed(env));
          case "/admin/setup-webhook":
            return json({
              webhook: await tg(env.TELEGRAM_BOT_TOKEN, "setWebhook", {
                url: `${origin}/tg/webhook`,
                secret_token: env.TELEGRAM_WEBHOOK_SECRET,
                allowed_updates: ["message", "callback_query"],
              }),
              menuButton: await tg(env.TELEGRAM_BOT_TOKEN, "setChatMenuButton", {
                chat_id: Number(env.OWNER_TG_ID),
                menu_button: { type: "web_app", text: "Рейтинг", web_app: { url: `${origin}/` } },
              }),
            });
          case "/admin/reviews":
            return json((await env.DB.prepare(
              `SELECT a.id, a.name, a.year, a.price, a.city, a.distance_km, a.fuel, a.credit, a.url,
                      r.total_score, r.body_score, r.rust_score, r.interior_score, r.has_ac,
                      r.accident_signs, r.real_mileage_note, r.summary
                 FROM reviews r JOIN ads a ON a.id = r.ad_id
                ORDER BY r.total_score DESC LIMIT 100`,
            ).all()).results);
          case "/admin/ads": {
            const status = searchParams.get("status");
            const sql = status
              ? "SELECT * FROM ads WHERE status = ? ORDER BY price LIMIT 200"
              : "SELECT * FROM ads ORDER BY status, price LIMIT 200";
            const stmt = status ? env.DB.prepare(sql).bind(status) : env.DB.prepare(sql);
            return json((await stmt.all()).results);
          }
          case "/admin/search":
            if (target) return json(await runSearch(target));
            break;
          case "/admin/ad":
            if (target) {
              const url = checkTurboUrl(target);
              return json(await parseAdPage(await fetchTurbo(url), url));
            }
            break;
        }
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : String(e) }, 500);
      }
    }
    return new Response("Not found", { status: 404 });
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      (async () => {
        // Each step runs even if the previous one failed; the result goes to 'health'.
        const health: Record<string, unknown> = { at: new Date().toISOString() };
        for (const [name, step] of [["scan", scanAll], ["review", reviewNew], ["notify", notifyReviewed]] as const) {
          try {
            health[name] = await step(env);
          } catch (e) {
            health[name] = { errors: [e instanceof Error ? e.message : String(e)] };
          }
        }
        console.log("cron", JSON.stringify(health));
        await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('health', ?)")
          .bind(JSON.stringify(health)).run();
      })(),
    );
  },
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
