// Telegram webhook: only the owner is served.

import type { Env } from "../env";
import { tg } from "./api";

interface Update {
  message?: { chat: { id: number }; from?: { id: number }; text?: string };
  callback_query?: {
    id: string;
    from: { id: number };
    data?: string;
    message?: { chat: { id: number }; message_id: number };
  };
}

export async function handleWebhook(request: Request, env: Env): Promise<Response> {
  if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response("Forbidden", { status: 403 });
  }
  const update = (await request.json()) as Update;
  const owner = Number(env.OWNER_TG_ID);

  const cb = update.callback_query;
  if (cb) {
    if (cb.from.id !== owner) {
      await tg(env.TELEGRAM_BOT_TOKEN, "answerCallbackQuery", { callback_query_id: cb.id, text: "Нет доступа" });
      return new Response("ok");
    }
    const [action, adId] = (cb.data ?? "").split(":");
    const status = action === "like" ? "interesting" : action === "nope" ? "rejected" : null;
    if (status && adId) {
      await env.DB.prepare("UPDATE ads SET status = ?, status_reason = NULL WHERE id = ?").bind(status, adId).run();
      const label = status === "interesting" ? "✅ В избранном" : "❌ Отклонено";
      await tg(env.TELEGRAM_BOT_TOKEN, "answerCallbackQuery", { callback_query_id: cb.id, text: label });
      if (cb.message) {
        await tg(env.TELEGRAM_BOT_TOKEN, "editMessageReplyMarkup", {
          chat_id: cb.message.chat.id,
          message_id: cb.message.message_id,
          reply_markup: {
            inline_keyboard: [[{
              text: status === "interesting" ? "✅ В избранном · убрать" : "❌ Отклонено · вернуть",
              callback_data: `${status === "interesting" ? "nope" : "like"}:${adId}`,
            }]],
          },
        });
      }
    }
    return new Response("ok");
  }

  const msg = update.message;
  if (msg && msg.from?.id === owner && msg.text?.startsWith("/start")) {
    await tg(env.TELEGRAM_BOT_TOKEN, "sendMessage", {
      chat_id: msg.chat.id,
      text: "Слежу за Turbo.az. Подходящие машины пришлю сюда, отмечайте 👍 или 👎.",
    });
  }
  return new Response("ok");
}
