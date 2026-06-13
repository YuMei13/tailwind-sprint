"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import Onboarding from "@/components/Onboarding";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

const ONBOARDED_KEY = "soonla.onboarded.v1";

export default function HomePage() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  // Whether we've checked localStorage yet — gates the location request so it
  // never fires before we know if onboarding should show.
  const [onboardingDecided, setOnboardingDecided] = useState(false);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(ONBOARDED_KEY)) setShowOnboarding(true);
    } catch {
      // localStorage unavailable — skip onboarding rather than block the app.
    }
    setOnboardingDecided(true);
  }, []);

  const dismissOnboarding = () => {
    try {
      window.localStorage.setItem(ONBOARDED_KEY, "1");
    } catch {
      // ignore
    }
    setShowOnboarding(false);
  };

  return (
    <main style={{ height: "100dvh", width: "100%" }}>
      {/* Ask for location only after the welcome is dismissed (or skipped). */}
      <MapView locationEnabled={onboardingDecided && !showOnboarding} />
      {showOnboarding && <Onboarding onDismiss={dismissOnboarding} />}
    </main>
  );
}
