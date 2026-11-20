// Download a Turbo.az page. Only turbo.az hosts are allowed.

const ALLOWED_HOSTS = new Set(["turbo.az", "ru.turbo.az"]);

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  "Accept-Language": "ru,az;q=0.9,en;q=0.8",
};

export function checkTurboUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname)) {
    throw new Error(`Not a turbo.az link: ${raw}`);
  }
  return url;
}

export async function fetchTurbo(url: URL): Promise<Response> {
  const res = await fetch(url.toString(), { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`Turbo.az answered ${res.status} for ${url}`);
  }
  return res;
}
