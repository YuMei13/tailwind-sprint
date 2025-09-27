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
    iconSize: [12, 12],
    iconAnchor: [6, 6],
    html: `
      <div style="
        width: 0;
        height: 0;
        border-left: 6px solid transparent;
        border-right: 6px solid transparent;
        border-bottom: 12px solid ${color};
        transform: rotate(${dirDeg}deg);
        transform-origin: center;
      "></div>
    `,
  });
}
