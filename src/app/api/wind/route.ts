import { NextRequest, NextResponse } from "next/server";
import dns from "node:dns";

// 讓 Node fetch 優先走 IPv4，避免 IPv6 卡住
dns.setDefaultResultOrder?.("ipv4first");

type WindReq = { points?: Array<[number, number]> };
type WindPoint = {
  lat: number;
  lon: number;
  speedKmh?: number;
  dirDeg?: number;
  error?: true;
  msg?: string;
};

// 單點請求：7s timeout + 最多 3 次重試
async function fetchWind(lat: number, lon: number) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("hourly", "windspeed_10m,winddirection_10m");
  url.searchParams.set("forecast_days", "1");
  url.searchParams.set("timezone", "auto");

  const once = async () => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 7000);
    try {
      const res = await fetch(url, { signal: ac.signal, next: { revalidate: 600 } });
      if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(t);
    }
  };

  for (let i = 0; i < 3; i++) {
    try {
      return await once();
    } catch (e) {
      if (i === 2) throw e;
      await new Promise((r) => setTimeout(r, 400 * (i + 1))); // 0.4s / 0.8s backoff
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const { points } = (await req.json()) as WindReq;

    if (!Array.isArray(points) || points.length === 0) {
      return NextResponse.json(
        { error: "Invalid body. Expect { points: Array<[lat,lon]> }", code: "BAD_REQUEST" },
        { status: 400 }
      );
    }

    const MAX_POINTS = 30;
    const pts = points.slice(0, MAX_POINTS);

    const results: WindPoint[] = [];
    for (const [latRaw, lonRaw] of pts) {
      const lat = Number(latRaw);
      const lon = Number(lonRaw);

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        results.push({ lat, lon, error: true, msg: "Bad lat/lon" });
        continue;
      }

      try {
        const data = await fetchWind(lat, lon);
        const speeds = data?.hourly?.windspeed_10m;
        const dirs = data?.hourly?.winddirection_10m;

        if (!Array.isArray(speeds) || !speeds.length || !Array.isArray(dirs) || !dirs.length) {
          results.push({ lat, lon, error: true, msg: "No hourly wind data" });
          continue;
        }

        results.push({
          lat,
          lon,
          speedKmh: Number(speeds[0]),
          dirDeg: Number(dirs[0]),
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "fetch failed";
        results.push({ lat, lon, error: true, msg });
      }
    }

    return NextResponse.json({ points: results });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message, code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
