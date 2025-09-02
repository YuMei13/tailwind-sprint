// 簡易抽樣：每 step 取一點（輸入為 [lon, lat] 陣列）
export function downsampleLonLat(coords: number[][], step: number): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    if (!Array.isArray(coords) || coords.length === 0) return out;
    for (let i = 0; i < coords.length; i += step) {
      const [lon, lat] = coords[i];
      out.push([lat, lon]); // Open-Meteo 要 [lat, lon]
    }
    // 確保最後一點也被取到
    const [lonLast, latLast] = coords[coords.length - 1];
    const last = out[out.length - 1];
    if (!last || last[0] !== latLast || last[1] !== lonLast) {
      out.push([latLast, lonLast]);
    }
    return out;
  }
  
  