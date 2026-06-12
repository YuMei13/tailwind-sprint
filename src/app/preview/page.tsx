"use client";
// Temporary design-review page for the UI restyle. View at /preview.
import WindLegend from "@/components/WindLegend";

export default function PreviewPage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        padding: 24,
        // A muted, map-like backdrop so the frosted-glass surfaces read correctly.
        background:
          "radial-gradient(120% 90% at 20% 10%, #e9eef3 0%, #dfe6ec 40%, #cfd9e1 100%)",
        backgroundColor: "#dfe6ec",
        fontFamily: "var(--font-geist-sans), -apple-system, system-ui, sans-serif",
      }}
    >
      {/* faux map lines for depth behind the glass */}
      <svg
        width="100%"
        height="100%"
        style={{ position: "fixed", inset: 0, opacity: 0.35, pointerEvents: "none" }}
      >
        {Array.from({ length: 14 }).map((_, i) => (
          <line key={`h${i}`} x1="0" y1={i * 70} x2="2000" y2={i * 70} stroke="#b8c4cf" strokeWidth="1" />
        ))}
        {Array.from({ length: 14 }).map((_, i) => (
          <line key={`v${i}`} x1={i * 90} y1="0" x2={i * 90} y2="2000" stroke="#b8c4cf" strokeWidth="1" />
        ))}
        <path d="M -50 400 C 200 300, 400 600, 700 420 S 1100 300, 1400 500" stroke="#9fb0bd" strokeWidth="6" fill="none" />
      </svg>

      <div style={{ position: "relative", display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ width: 264 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 10 }}>Wind mode</p>
          <WindLegend
            mode="wind"
            windAngleRatio={{ same: 58, cross: 27, opposite: 15, total: 100 }}
            onToggleMode={() => {}}
          />
        </div>
        <div style={{ width: 264 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 10 }}>Slope mode</p>
          <WindLegend mode="slope" onToggleMode={() => {}} />
        </div>
      </div>
    </main>
  );
}
