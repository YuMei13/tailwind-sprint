"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

export default function HomePage() {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const t = window.setTimeout(() => setShowSplash(false), 1000);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <main style={{ height: "100dvh", width: "100%" }}>
      {showSplash ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "#FCFCFA",
            backgroundImage: 'url("/soonla-splash.png")',
            backgroundRepeat: "no-repeat",
            backgroundPosition: "center center",
            backgroundSize: "contain",
            zIndex: 9999,
          }}
        />
      ) : (
        <MapView />
      )}
    </main>
  );
}
