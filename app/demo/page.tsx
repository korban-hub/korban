"use client";
import { useEffect } from "react";

export default function DemoPage() {
  useEffect(() => {
    window.location.href = "/dashboard";
  }, []);

  return (
    <main className="min-h-screen bg-[#050505] flex items-center justify-center">
      <p className="text-xs text-zinc-600">Redirecting…</p>
    </main>
  );
}
