"use client";
import dynamic from "next/dynamic";

/**
 * Design Space draws in the browser - pdf.js, the pointer, local storage -
 * so it is loaded there and not rendered on the server, like Set Scaffold.
 */
const DesignSpaceInner = dynamic(
  () => import("@/components/design-space-inner"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-screen items-center justify-center bg-[#070605]">
        <p className="text-xs text-zinc-600">Loading Design Space&hellip;</p>
      </div>
    ),
  }
);

export default function DesignSpacePage() {
  return <DesignSpaceInner />;
}
