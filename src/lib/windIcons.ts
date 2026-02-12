// src/lib/windIcons.ts
import { windToColor } from "@/lib/wind";

/**
 * Generate an arrow icon SVG for wind direction
 * @param dirDeg Wind direction (degrees, 0 = north wind = blowing south)
 * @param speedMs Wind speed (m/s)
 */
export function getArrowIcon(dirDeg: number, speedMs: number): string {
  const color = Number.isFinite(speedMs) ? windToColor(speedMs) : "#6b7280";

  return `
    <div style="
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      transform: rotate(${dirDeg}deg);
      color: ${color};
    ">
      <svg width="36" height="36" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        <polygon points="16,8 24,12 16,16" fill="currentColor" />
      </svg>
    </div>
  `;
}
