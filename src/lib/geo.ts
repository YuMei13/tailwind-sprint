// src/lib/geo.ts
const R = 6371e3; // 地球半徑（公尺）
const toRad = (x: number) => (x * Math.PI) / 180;

/** 兩點球面距離（單位：公尺）。輸入為 [lon, lat]。 */
export function haversine(a: [number, number], b: [number, number]): number {
  const φ1 = toRad(a[1]);
  const φ2 = toRad(b[1]);
  const dφ = toRad(b[1] - a[1]);
  const dλ = toRad(b[0] - a[0]);
  const s =
    Math.sin(dφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * 沿 polyline（[lon,lat][]）每 intervalMeters 取一個點。
 * 回傳為 Open-Meteo / 多數 API 習慣的 [lat,lon][]。
 */
export function sampleByDistance(
  coords: number[][],
  intervalMeters = 300
): Array<[number, number]> {
  if (!Array.isArray(coords) || coords.length < 2) return [];
  const out: Array<[number, number]> = [];
  let acc = 0;
  let next = 0;

  for (let i = 1; i < coords.length; i++) {
    const p0 = coords[i - 1] as [number, number];
    const p1 = coords[i] as [number, number];
    const seg = haversine(p0, p1);

    while (acc + seg >= next) {
      const t = (next - acc) / seg; // 0..1
      const lon = p0[0] + (p1[0] - p0[0]) * t;
      const lat = p0[1] + (p1[1] - p0[1]) * t;
      out.push([lat, lon]);
      next += intervalMeters;
    }
    acc += seg;
  }

  // 尾點保底
  const last = coords[coords.length - 1];
  const tail: [number, number] = [last[1], last[0]];
  const prev = out[out.length - 1];
  if (!prev || prev[0] !== tail[0] || prev[1] !== tail[1]) out.push(tail);

  return out;
}
