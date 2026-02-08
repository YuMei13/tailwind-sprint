// src/lib/windIcons.ts

/**
 * Generate an arrow icon SVG for wind direction
 * @param dirDeg Wind direction (degrees, 0 = north wind = blowing south)
 * @param speedKmh Wind speed (km/h) - used for sizing
 */
export function getArrowIcon(dirDeg: number, speedKmh: number): string {
  // Color based on wind speed
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
