import { NextRequest, NextResponse } from "next/server";

type RouteReq = { start?: [number, number]; end?: [number, number] };
type OrsResponse = {
  features: Array<{
    bbox: [number, number, number, number];
    geometry: { type: "LineString"; coordinates: number[][] };
    properties: {
      summary?: { distance?: number; duration?: number };
    };
  }>;
};

export async function POST(req: NextRequest) {
  try {
    const { start, end } = (await req.json()) as RouteReq;

    // 驗證輸入
    if (!start || !end || start.length !== 2 || end.length !== 2) {
      return NextResponse.json(
        { error: "Invalid body. Expect { start:[lon,lat], end:[lon,lat] }", code: "BAD_REQUEST" },
        { status: 400 }
      );
    }
    if (!process.env.ORS_API_KEY) {
      return NextResponse.json(
        { error: "Missing ORS_API_KEY", code: "MISSING_ENV" },
        { status: 500 }
      );
    }

    // 準備 ORS 請求
    const upstream = await fetch(
      "https://api.openrouteservice.org/v2/directions/cycling-regular/geojson",
      {
        method: "POST",
        headers: {
          "Authorization": process.env.ORS_API_KEY,
          "Content-Type": "application/json",
        },
        // 注意：ORS 需要 [ [lon,lat], [lon,lat] ]
        body: JSON.stringify({
          coordinates: [start, end],
          elevation: true,
          instructions: false,
        }),
        // 輕量快取：10 分鐘（同一路線重複請求時可直接命中）
        next: { revalidate: 600 },
      }
    );

    if (!upstream.ok) {
      const text = await upstream.text();
      return NextResponse.json(
        { error: `ORS upstream error: ${text}`, code: "ORS_UPSTREAM_ERROR" },
        { status: 502 }
      );
    }

    const json = (await upstream.json()) as OrsResponse;

    // 防禦：確保資料存在
    const f = json.features?.[0];
    if (!f?.geometry?.coordinates?.length) {
      return NextResponse.json(
        { error: "ORS returned empty geometry", code: "EMPTY_GEOMETRY" },
        { status: 502 }
      );
    }

    const distance = f.properties?.summary?.distance ?? null;
    const duration = f.properties?.summary?.duration ?? null;

    // 對前端輸出標準化（縮小 payload，避免把整包 ORS 丟出去）
    return NextResponse.json({
      geometry: { type: "LineString", coordinates: f.geometry.coordinates },
      distance,
      duration,
      bbox: f.bbox,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: message, code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

