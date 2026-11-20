export interface Env {
  DB: D1Database;
  OWNER_TG_ID: string;
  TELEGRAM_BOT_TOKEN: string;
  ADMIN_KEY: string; // protects the test endpoints
  GEMINI_API_KEY: string;
  TELEGRAM_WEBHOOK_SECRET: string;
}
