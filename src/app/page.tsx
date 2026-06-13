"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import Onboarding from "@/components/Onboarding";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

const ONBOARDED_KEY = "soonla.onboarded.v1";

export default function HomePage() {
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(ONBOARDED_KEY)) setShowOnboarding(true);
    } catch {
      // localStorage unavailable — skip onboarding rather than block the app.
    }
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
      <MapView />
      {showOnboarding && <Onboarding onDismiss={dismissOnboarding} />}
    </main>
  );
}
