export function windToColor(speedMS: number) {
    if (speedMS < 3) return "#22c55e";   // 綠
    if (speedMS < 6) return "#eab308";   // 黃
    if (speedMS < 10) return "#f97316";  // 橘
    return "#ef4444";                    // 紅
  }
  
  // 氣象學風向：數值表示「風從哪裡吹來」（0=北風）
  export function degToCompass(deg: number) {
    const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE",
                  "S","SSW","SW","WSW","W","WNW","NW","NNW"];
    const ix = Math.round(((deg % 360) / 22.5)) % 16;
    return dirs[ix];
  }
  
  