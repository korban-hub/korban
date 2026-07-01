"use client";

import dynamic from "next/dynamic";

// Wrap the entire map component in dynamic with ssr:false
// This kills all SSR/hydration issues with Leaflet in one shot
const AerialMapInner = dynamic(() => import("@/components/aerial-map-inner"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-zinc-950">
      <p className="text-xs text-zinc-600">Loading satellite map…</p>
    </div>
  ),
});

export default function TakeoffWorkspaceAerialPage() {
  return <AerialMapInner />;
}
