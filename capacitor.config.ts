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
  plugins: {
    // Hold the native launch screen (the .jpg logo on #FEFEFE) on screen long
    // enough to cover the bundle's JS load/hydration, so the user sees the
    // splash instead of a blank flash before the map appears.
    SplashScreen: {
      launchShowDuration: 2500,
      launchAutoHide: true,
      backgroundColor: "#FEFEFE",
      showSpinner: false,
    },
  },
};

export default config;
