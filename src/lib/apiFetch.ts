// Drop-in fetch for the app's own /api routes.
//
// In the bundled iOS app the front-end is served from capacitor://localhost, so a
// normal cross-origin fetch to the deployed backend would be blocked by CORS. On
// native we therefore use Capacitor's native HTTP (CapacitorHttp), which makes the
// request outside the WebView and is not subject to CORS. On web we just use fetch
// (same-origin in dev / on the deployed site).
//
// Set NEXT_PUBLIC_API_BASE to the deployed backend (e.g. https://tailwind-sprint.vercel.app)
// when building the bundle so /api/* calls resolve to it.
import { Capacitor, CapacitorHttp } from "@capacitor/core";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  if (API_BASE) return `${API_BASE}${path}`;
  if (typeof window !== "undefined") return `${window.location.origin}${path}`;
  return path;
}

/** fetch() for /api/* — returns a standard Response on both native and web. */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = apiUrl(path);

  if (!Capacitor.isNativePlatform()) {
    return fetch(url, { cache: "no-store", ...init });
  }

  const method = (init?.method ?? "GET").toString().toUpperCase();
  const headers = (init?.headers as Record<string, string> | undefined) ?? {};
  let data: unknown = undefined;
  if (init?.body != null) {
    try {
      data = JSON.parse(init.body as string);
    } catch {
      data = init.body;
    }
  }

  const res = await CapacitorHttp.request({
    url,
    method,
    headers: { "Content-Type": "application/json", ...headers },
    data,
  });

  const bodyStr =
    typeof res.data === "string" ? res.data : JSON.stringify(res.data ?? null);
  return new Response(bodyStr, {
    status: res.status,
    headers: (res.headers as Record<string, string>) ?? {},
  });
}
