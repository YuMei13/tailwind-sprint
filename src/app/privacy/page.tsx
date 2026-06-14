import type { Metadata } from "next";
import { ui } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Privacy Policy — Soonla",
  description:
    "How Soonla uses your data: location for app functionality only. No accounts, no analytics, no ads, no tracking.",
};

const UPDATED = "14 June 2026";

const PROVIDERS: { name: string; use: string; url: string }[] = [
  { name: "Mapbox", use: "maps, geocoding (search) and routing", url: "https://www.mapbox.com/legal/privacy" },
  { name: "OpenRouteService", use: "routing and geocoding", url: "https://openrouteservice.org/privacy-policy/" },
  { name: "Open-Meteo", use: "wind and weather data", url: "https://open-meteo.com/en/terms" },
  { name: "OpenTopoData", use: "elevation data", url: "https://www.opentopodata.org/" },
  { name: "Windy.com Webcams", use: "nearby live webcams", url: "https://www.windy.com/privacy-policy" },
];

export default function PrivacyPage() {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "48px 22px 96px",
        color: ui.ink,
        fontSize: 16,
        lineHeight: 1.6,
        WebkitTextSizeAdjust: "100%",
      }}
    >
      <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 }}>
        Privacy Policy
      </h1>
      <p style={{ color: ui.muted, fontSize: 14, marginTop: 6 }}>Last updated: {UPDATED}</p>

      <p style={{ marginTop: 22 }}>
        Soonla helps you plan cycling routes with wind and elevation in mind. This policy explains
        what data the app uses, why, and who it is shared with. We aim to collect as little as
        possible.
      </p>

      <Section title="Summary">
        <ul style={listStyle}>
          <li>We <strong>do not</strong> have user accounts, and we <strong>do not</strong> track you across apps or websites.</li>
          <li>We <strong>do not</strong> use any advertising or analytics SDKs.</li>
          <li>The app uses your <strong>location</strong> only to show your position on the map and to plan routes and fetch nearby conditions you ask for.</li>
          <li>Route planning, wind, elevation, and webcam features work by sending the relevant coordinates to mapping and weather providers to get results back.</li>
        </ul>
      </Section>

      <Section title="Information the app uses">
        <h3 style={subhead}>Location</h3>
        <p>With your permission, the app accesses your device location to center the map on where you are, and to use your position as a starting point for routes, wind, and nearby webcam lookups.</p>
        <p>Your location is used on-device and is included in requests to the mapping and weather services below <strong>only when needed to fulfil a feature you trigger</strong>. We do not keep a history of your location on our servers, and we do not use it to identify you. You can deny or revoke location access at any time in your device settings; the app still works, it just won&apos;t auto-center on you.</p>

        <h3 style={subhead}>Route and map coordinates</h3>
        <p>When you plan a route, search for a place, view the wind along a path, read an elevation profile, or look for nearby webcams, the app sends the relevant coordinates (such as start, end, and waypoints) to the service providers below to return results. These coordinates are not linked to your identity.</p>

        <h3 style={subhead}>On-device storage</h3>
        <p>The app stores a small amount of data <strong>on your device only</strong>, such as whether you&apos;ve seen the welcome screen and recently used route presets. This never leaves your device and is removed if you delete the app.</p>
      </Section>

      <Section title="Third-party services">
        <p>To provide its features, the app sends requests to the following providers. Each has its own privacy policy governing how they handle request data:</p>
        <ul style={listStyle}>
          {PROVIDERS.map((p) => (
            <li key={p.name}>
              <a href={p.url} target="_blank" rel="noreferrer" style={linkStyle}>{p.name}</a> — {p.use}.
            </li>
          ))}
          <li><strong>Soonla backend</strong> — a service operated by us that relays the requests above and caches results to keep the app fast. It does not store your personal data or build a profile of you.</li>
        </ul>
        <p>We do not sell your data, and we do not share it with anyone other than the providers needed to deliver the feature you used.</p>
      </Section>

      <Section title="Data we do not collect">
        <ul style={listStyle}>
          <li>No name, email, phone number, or account.</li>
          <li>No advertising identifiers; no cross-app or cross-site tracking.</li>
          <li>No analytics or crash-tracking SDKs.</li>
        </ul>
      </Section>

      <Section title="Children">
        <p>Soonla is not directed at children and does not knowingly collect personal information from children.</p>
      </Section>

      <Section title="Changes">
        <p>If this policy changes, we will update the &ldquo;Last updated&rdquo; date above and post the new version at the same URL.</p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about this policy? Contact us at{" "}
          <a href="mailto:yenchung207@gmail.com" style={linkStyle}>yenchung207@gmail.com</a>.
        </p>
      </Section>
    </main>
  );
}

const listStyle: React.CSSProperties = { paddingLeft: 22, margin: "8px 0", display: "flex", flexDirection: "column", gap: 6 };
const subhead: React.CSSProperties = { fontSize: 18, fontWeight: 650, letterSpacing: "-0.01em", margin: "20px 0 4px" };
const linkStyle: React.CSSProperties = { color: ui.accent, fontWeight: 500 };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 30 }}>
      <h2
        style={{
          fontSize: 13,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: ui.inkSecondary,
          borderTop: `0.5px solid ${ui.hairline}`,
          paddingTop: 16,
          margin: 0,
        }}
      >
        {title}
      </h2>
      <div style={{ marginTop: 8 }}>{children}</div>
    </section>
  );
}
