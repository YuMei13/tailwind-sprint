import type { CapacitorConfig } from "@capacitor/cli";

// By default the app loads the bundled static front-end (webDir) — it ships its
// own code and is not tied to any deployment. Set CAP_SERVER_URL to load from a
// live/dev server instead (e.g. http://localhost:3000 during development).
const serverUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: "com.soonla.tailwindsprint",
  appName: "Soonla",
  webDir: "out",
  server: serverUrl
    ? {
        url: serverUrl,
        cleartext: serverUrl.startsWith("http://"),
      }
    : undefined,
  ios: {
    contentInset: "always",
  },
};

export default config;
