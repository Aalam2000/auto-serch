// Public order form: Turnstile check -> save -> message to the owner.

import type { Env } from "../env";
import { escapeHtml, tg } from "../telegram/api";

const LIMITS = { name: 100, contact: 100, message: 2000 };

export async function handleOrder(request: Request, env: Env): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "bad request" }, 400);
  }

  const name = String(body.name ?? "").trim();
  const contact = String(body.contact ?? "").trim();
  const message = String(body.message ?? "").trim();
  const lang = String(body.lang ?? "").slice(0, 5);
  const token = String(body.token ?? "");

  if (!name || !contact || !message) return json({ error: "empty" }, 400);
  if (name.length > LIMITS.name || contact.length > LIMITS.contact || message.length > LIMITS.message) {
    return json({ error: "too long" }, 400);
  }
  if (!(await turnstileOk(env, token, request.headers.get("CF-Connecting-IP")))) {
    return json({ error: "captcha" }, 403);
  }

  const country = (request as Request & { cf?: { country?: string } }).cf?.country ?? null;
  const now = new Date().toISOString();
  const res = await env.DB.prepare(
    "INSERT INTO orders (name, contact, message, lang, country, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).bind(name, contact, message, lang, country, now).run();

  try {
    await tg(env.TELEGRAM_BOT_TOKEN, "sendMessage", {
      chat_id: env.OWNER_TG_ID,
      parse_mode: "HTML",
      text: [
        `📩 <b>Новая заявка #${res.meta.last_row_id}</b> (${escapeHtml(lang)}${country ? ", " + escapeHtml(country) : ""})`,
        `<b>Имя:</b> ${escapeHtml(name)}`,
        `<b>Контакт:</b> ${escapeHtml(contact)}`,
        "",
        escapeHtml(message),
      ].join("\n"),
    });
  } catch {
    // The order is saved anyway.
  }
  return json({ ok: true });
}

async function turnstileOk(env: Env, token: string, ip: string | null): Promise<boolean> {
  if (!env.TURNSTILE_SECRET || !token) return false;
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  const data = (await res.json()) as { success?: boolean };
  return data.success === true;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
