import { NextRequest, NextResponse } from "next/server";

const ORS_KEY = process.env.ORS_API_KEY!;
const ORS_URL = "https://api.openrouteservice.org/geocode/search";

type GeocodeResp = {
  features?: Array<{
    geometry?: { coordinates?: [number, number] }; // [lon, lat]
    properties?: { label?: string };
  }>;
};

export async function GET(req: NextRequest) {
  if (!ORS_KEY) return NextResponse.json({ error: "Missing ORS_API_KEY" }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ error: "Missing q" }, { status: 400 });

  // 預設限定台灣；若要查全球把 boundary.country=TW 拿掉
  const url = `${ORS_URL}?text=${encodeURIComponent(q)}&size=5&boundary.country=TW`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: ORS_KEY },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    return NextResponse.json({ error: `ORS ${res.status} ${txt}` }, { status: res.status });
  }

  const json = (await res.json()) as GeocodeResp;
  const items =
    json.features?.map((f) => {
      const [lon, lat] = f.geometry?.coordinates ?? [undefined, undefined];
      return { name: f.properties?.label ?? "", lat, lon };
    }) ?? [];

  return NextResponse.json({ items: items.filter((i) => Number.isFinite(i.lat) && Number.isFinite(i.lon)) });
}
