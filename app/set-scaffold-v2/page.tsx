"use client";
import dynamic from "next/dynamic";

const SetScaffoldV2Inner = dynamic(
  () => import("@/components/set-scaffold-v2-inner"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-screen items-center justify-center bg-[#080604]">
        <p className="text-xs text-zinc-600">Loading Set Scaffold…</p>
      </div>
    ),
  }
);

export default function SetScaffoldV2Page() {
  return <SetScaffoldV2Inner />;
}
