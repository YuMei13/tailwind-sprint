// src/lib/windIcons.ts
import { windToColor } from "@/lib/wind";

/**
 * Generate an arrow icon SVG for wind direction
 * @param dirDeg Wind direction (degrees, 0 = north wind = blowing south)
 * @param speedMs Wind speed (m/s)
 */
export function getArrowIcon(dirDeg: number, speedMs: number): string {
  const color = "#C4AF27";
  const strokeWidth =
    Number.isFinite(speedMs)
      ? speedMs < 3
        ? 1.2
        : speedMs < 6
          ? 3.2
          : speedMs < 10
            ? 5.2
            : 7.2
      : 2;
  // SVG arrow points to the right (east) at 0deg rotation.
  // Meteorological azimuth uses 0deg = north, clockwise positive.
  // Convert so displayed arrow matches map azimuth convention.
  const rotationDeg = dirDeg - 90;

  return `
    <div style="
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      transform: rotate(${rotationDeg}deg);
      color: ${color};
    ">
      <svg width="36" height="36" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <line x1="4" y1="12" x2="20" y2="12" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" />
        <polygon points="16,8 24,12 16,16" fill="${color}" />
      </svg>
    </div>
  `;
}
