// src/app/api/route/route.ts
import { NextRequest, NextResponse } from "next/server";
import { buildKey, cacheFetchJSON } from "@/lib/cache";

type ORSFeature = {
  geometry?: { type?: string; coordinates?: [number, number][] };
  properties?: unknown;
};
type ORSResponse = { features?: ORSFeature[] } & Record<string, unknown>;

export async function POST(req: NextRequest) {
  try {
    const { start, end, profile = "cycling-regular" } = (await req.json()) as {
      start?: [number, number]; // [lon,lat]
      end?: [number, number];
      profile?: string;
    };
    if (!start || !end) return NextResponse.json({ error: "missing start/end" }, { status: 400 });
    const ORS_KEY = process.env.ORS_API_KEY;
    if (!ORS_KEY) return NextResponse.json({ error: "Missing ORS_API_KEY" }, { status: 500 });

    const nocache = req.nextUrl.searchParams.get("nocache") === "1";
    const key = buildKey("route", { start, end, profile });

    const data = await cacheFetchJSON<ORSResponse>(
      key,
      3600, // 1h
      async () => {
        const url = `https://api.openrouteservice.org/v2/directions/${encodeURIComponent(profile)}`;
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: ORS_KEY },
          body: JSON.stringify({ coordinates: [start, end] }),
          cache: "no-store",
          signal: AbortSignal.timeout(20000),
        });
        if (!r.ok) {
          const txt = await r.text().catch(() => "");
          throw new Error(`ORS ${r.status} ${txt}`.trim());
        }
        return (await r.json()) as ORSResponse;
      },
      nocache
    );

    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
