// Clean, minimal design tokens — calm, iOS-like translucent materials.
// Shared across the map's floating panels/controls so the restyle stays cohesive.

export const ui = {
  // Floating surfaces (frosted glass)
  surface: "rgba(255, 255, 255, 0.72)",
  surfaceSolid: "rgba(255, 255, 255, 0.94)",
  blur: "saturate(180%) blur(20px)",
  border: "0.5px solid rgba(255, 255, 255, 0.6)",
  ring: "inset 0 0 0 0.5px rgba(60, 60, 67, 0.12)",
  radius: 16,
  radiusSm: 10,
  radiusPill: 980,
  shadow: "0 6px 24px rgba(17, 24, 39, 0.12)",
  shadowSm: "0 2px 10px rgba(17, 24, 39, 0.10)",

  // Text (iOS label scale)
  ink: "#1c1c1e",
  inkSecondary: "rgba(60, 60, 67, 0.78)",
  muted: "rgba(60, 60, 67, 0.5)",
  hairline: "rgba(60, 60, 67, 0.12)",

  // Single calm accent (brand navy)
  accent: "#1f3a5f",
  accentSoft: "rgba(31, 58, 95, 0.1)",

  // Section label (small, uppercase, tracked) — used as a style spread
  sectionLabel: {
    fontSize: 11,
    fontWeight: 590,
    letterSpacing: "0.04em",
    textTransform: "uppercase" as const,
    color: "rgba(60, 60, 67, 0.5)",
  },
} as const;

/** Spread onto any floating panel/control for the frosted-glass material. */
export const glassSurface = {
  background: ui.surface,
  backdropFilter: ui.blur,
  WebkitBackdropFilter: ui.blur,
  border: ui.border,
  boxShadow: `${ui.shadow}, ${ui.ring}`,
  borderRadius: ui.radius,
} as const;
