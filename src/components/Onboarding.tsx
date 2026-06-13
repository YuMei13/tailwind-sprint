"use client";
import { ui, glassSurface } from "@/lib/ui";

const iconProps = {
  viewBox: "0 0 24 24",
  width: 18,
  height: 18,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const FEATURES = [
  {
    title: "Plan a route",
    desc: "Search or tap the map for start, end and stops — or pick a preset.",
    icon: (
      <svg {...iconProps}>
        <path d="M4 17c3-5 6-7 9-8" />
        <path d="M13 9h6" />
        <path d="M17 5l4 4-4 4" />
        <circle cx="4" cy="17" r="1.5" />
      </svg>
    ),
  },
  {
    title: "Read the wind",
    desc: "Your route is colored tailwind → headwind, so you can ride smart.",
    icon: (
      <svg {...iconProps}>
        <path d="M3 8h11a3 3 0 1 0-3-3" />
        <path d="M3 12h15a3 3 0 1 1-3 3" />
        <path d="M3 16h8" />
      </svg>
    ),
  },
  {
    title: "Check the climb",
    desc: "An elevation profile shows every slope along the way.",
    icon: (
      <svg {...iconProps}>
        <path d="M3 17 9 9l4 5 4-7 4 10" />
      </svg>
    ),
  },
  {
    title: "Nearby webcams",
    desc: "Peek at live conditions near your route.",
    icon: (
      <svg {...iconProps}>
        <rect x="3" y="7" width="12" height="10" rx="2" />
        <path d="m15 10 6-3v10l-6-3" />
      </svg>
    ),
  },
];

export default function Onboarding({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Soonla"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        display: "grid",
        placeItems: "center",
        padding: 20,
        background: "rgba(17,24,39,0.32)",
        backdropFilter: "blur(3px)",
        WebkitBackdropFilter: "blur(3px)",
      }}
      onClick={onDismiss}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...glassSurface,
          background: ui.surfaceSolid,
          width: "100%",
          maxWidth: 380,
          padding: 24,
          color: ui.ink,
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 680, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
          Welcome to Soonla
        </div>
        <div style={{ fontSize: 14, color: ui.inkSecondary, marginTop: 5, marginBottom: 22 }}>
          Plan cycling routes with wind &amp; elevation in mind.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 24 }}>
          {FEATURES.map((f) => (
            <div key={f.title} style={{ display: "flex", gap: 13, alignItems: "flex-start" }}>
              <span
                style={{
                  flex: "0 0 auto",
                  width: 36,
                  height: 36,
                  borderRadius: ui.radiusSm,
                  display: "grid",
                  placeItems: "center",
                  background: ui.accentSoft,
                  color: ui.accent,
                }}
              >
                {f.icon}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600 }}>{f.title}</div>
                <div style={{ fontSize: 13, color: ui.muted, lineHeight: 1.35, marginTop: 1 }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={onDismiss}
          style={{
            width: "100%",
            padding: "13px 16px",
            borderRadius: ui.radiusSm,
            border: "none",
            background: ui.accent,
            color: "#fff",
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            cursor: "pointer",
          }}
        >
          Start riding
        </button>
      </div>
    </div>
  );
}
