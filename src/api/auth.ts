// Check Telegram Mini App initData (HMAC-SHA256 with the bot token).
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app

const MAX_AGE_SEC = 24 * 60 * 60;

export async function checkInitData(initData: string, botToken: string, ownerId: string): Promise<boolean> {
  if (!initData) return false;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return false;
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secret = await hmac(new TextEncoder().encode("WebAppData"), botToken);
  const expected = toHex(await hmac(secret, dataCheckString));
  if (!timingSafeEqual(expected, hash)) return false;

  const authDate = Number(params.get("auth_date"));
  if (!authDate || Date.now() / 1000 - authDate > MAX_AGE_SEC) return false;

  const user = JSON.parse(params.get("user") ?? "{}") as { id?: number };
  return String(user.id) === ownerId;
}

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data));
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
