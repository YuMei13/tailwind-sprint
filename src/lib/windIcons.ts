// src/lib/windIcons.ts
/**
 * Generate an arrow icon SVG for wind direction
 * @param dirDeg Wind direction (degrees, 0 = north wind = blowing south)
 * @param speedMs Wind speed (m/s)
 * @param zoom Current map zoom level (lower zoom => larger icon for readability)
 */
export function getArrowIcon(dirDeg: number, speedMs: number, zoom = 13): string {
  const color = "#C4AF27";
  const outline = "rgba(15,23,42,0.92)";
  const strokeWidth =
    Number.isFinite(speedMs)
      ? speedMs < 3
        ? 1.8
        : speedMs < 6
          ? 4.2
          : speedMs < 10
            ? 6.2
            : 8.2
      : 3;
  const iconPx =
    zoom <= 8
      ? 46
      : zoom <= 10
        ? 42
        : zoom <= 12
          ? 38
          : zoom <= 14
            ? 34
            : zoom <= 16
              ? 30
              : 28;
  // SVG arrow points to the right (east) at 0deg rotation.
  // Meteorological azimuth uses 0deg = north, clockwise positive.
  // Convert so displayed arrow matches map azimuth convention.
  const rotationDeg = dirDeg - 90;

  return `
    <div style="
      width: ${iconPx}px;
      height: ${iconPx}px;
      display: flex;
      align-items: center;
      justify-content: center;
      transform: rotate(${rotationDeg}deg);
      color: ${color};
      filter: drop-shadow(0 1px 2px rgba(0,0,0,0.55));
    ">
      <svg width="${iconPx}" height="${iconPx}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <line x1="3.5" y1="12" x2="18.5" y2="12" stroke="${outline}" stroke-width="${strokeWidth + 1.6}" stroke-linecap="round" />
        <line x1="3.5" y1="12" x2="18.5" y2="12" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" />
        <polygon points="16.2,7.2 24,12 16.2,16.8" fill="${outline}" />
        <polygon points="16.8,8.2 23,12 16.8,15.8" fill="${color}" />
      </svg>
    </div>
  `;
}
