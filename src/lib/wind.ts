// 風速 m/s → 顏色（綠/黃/橘/紅）
export function windToColor(speedMS: number) {
    if (speedMS < 3) return "#22c55e";   // 綠
    if (speedMS < 6) return "#eab308";   // 黃
    if (speedMS < 10) return "#f97316";  // 橘
    return "#ef4444";                    // 紅
  }
  
  // 風向角度 → 羅盤方位
  export function degToCompass(deg: number) {
    const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE",
                  "S","SSW","SW","WSW","W","WNW","NW","NNW"];
    const ix = Math.round(((deg % 360) / 22.5)) % 16;
    return dirs[ix];
  }
  
  // 圖例等級（m/s）
  export const WIND_BINS_MS = [
    { max: 3,   color: "#22c55e", label: "0–3" },
    { max: 6,   color: "#eab308", label: "3–6" },
    { max: 10,  color: "#f97316", label: "6–10" },
    { max: Infinity, color: "#ef4444", label: "≥10" },
  ];

  // 路線方向 vs 風向夾角（度）→ 顏色
  export function routeWindAngleToColor(angleDeg: number) {
    if (angleDeg < 45) return "#2563eb";   // blue
    if (angleDeg < 135) return "#f97316";  // orange
    return "#ef4444";                      // red
  }

  export const ROUTE_WIND_ANGLE_BINS = [
    { max: 45, color: "#2563eb", label: "0–45° (same-ish direction)" },
    { max: 135, color: "#f97316", label: "45–135° (crosswind-ish)" },
    { max: 180, color: "#ef4444", label: "135–180° (opposite-ish)" },
  ];
  
  
  
