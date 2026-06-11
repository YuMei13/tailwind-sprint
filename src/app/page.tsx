"use client";
import dynamic from "next/dynamic";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

export default function HomePage() {
  return (
    <main style={{ height: "100dvh", width: "100%" }}>
      <MapView />
    </main>
  );
}
