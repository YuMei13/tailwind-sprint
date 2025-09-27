// src/lib/windIcons.ts
import L from "leaflet";


/**
 * 根據風向與風速建立一個箭頭圖示
 * @param dirDeg 風向（度，0 = 北風 = 向南吹）
 * @param speedKmh 風速（公里/小時）
 */
export function getArrowIcon(dirDeg: number, speedKmh: number): L.DivIcon {
  // 根據風速選擇顏色（可自行調整）
  let color = "#6b7280"; // gray
  if (speedKmh > 50) {
    color = "#ef4444"; // red
  } else if (speedKmh > 30) {
    color = "#f59e0b"; // orange
  } else if (speedKmh > 15) {
    color = "#3b82f6"; // blue
  } else if (speedKmh >= 0) {
    color = "#10b981"; // green
  }

  return L.divIcon({
    className: "", // 清除預設樣式
    iconSize: [48, 48],
    iconAnchor: [24, 24],
    html: `
      <div style="
            width: 36px;
            height: 36px;
            display: flex;
            align-items: center;
            justify-content: center;
            transform: rotate(${dirDeg}deg);
            color: ${"#6b7280"};
            "
            >
            <svg width="48" height="48" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            <polygon points="16,8 24,12 16,16" fill="currentColor" />
            </svg>
    </div>
    `,
  });
}
