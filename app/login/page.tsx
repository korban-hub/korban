"use client";

import { useState } from "react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    // TODO: wire to real auth
    console.log("Sign in attempt", { username });
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070604] text-white">
      {/* Atmosphere */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-[#F97316]/15 blur-[160px]" />
        <div className="absolute -right-32 -top-24 h-[420px] w-[420px] rounded-full bg-[#F97316]/18 blur-[170px]" />
        <div className="absolute bottom-[-180px] right-[-80px] h-[620px] w-[620px] rounded-full bg-[#F97316]/20 blur-[190px]" />
        <div className="absolute inset-0 opacity-[0.035] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      {/* Center Content */}
      <div className="relative flex min-h-screen flex-col items-center justify-center px-6">
        <div className="flex w-full max-w-[400px] flex-col items-center">
          {/* Logo */}
          <Logo />

          {/* Tagline */}
          <p
            className="mt-4 text-center uppercase text-[#A1A1AA]"
            style={{
              fontFamily: "'Fira Code', ui-monospace, monospace",
              fontSize: "12px",
              letterSpacing: ".30em",
            }}
          >
            Scaffold Intelligence Platform
          </p>

          {/* Form */}
          <form onSubmit={handleSubmit} className="mt-14 w-full">
            <div>
              <label
                htmlFor="username"
                className="mb-2 block text-white"
                style={{ fontFamily: "Geist, sans-serif", fontSize: "14px", fontWeight: 500 }}
              >
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="estimator@korban.com"
                autoComplete="username"
                className="h-[52px] w-full rounded-full border border-white/25 bg-white/[0.02] px-6 text-sm text-[#F97316] outline-none transition placeholder:text-zinc-600 focus:border-[#F97316]/60 focus:bg-white/[0.04]"
                style={{ fontFamily: "'Fira Code', ui-monospace, monospace" }}
              />
            </div>

            <div className="mt-5">
              <label
                htmlFor="password"
                className="mb-2 block text-white"
                style={{ fontFamily: "Geist, sans-serif", fontSize: "14px", fontWeight: 500 }}
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="h-[52px] w-full rounded-full border border-white/25 bg-white/[0.02] px-6 pr-14 text-sm text-[#F97316] outline-none transition placeholder:text-zinc-600 focus:border-[#F97316]/60 focus:bg-white/[0.04]"
                  style={{ fontFamily: "'Fira Code', ui-monospace, monospace" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-5 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-wider text-zinc-500 hover:text-[#F97316]"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div className="mt-3 flex justify-end">
              <a
                href="/forgot-password"
                className="text-xs text-zinc-500 underline-offset-4 hover:text-[#F97316] hover:underline"
              >
                Forgot password?
              </a>
            </div>

            <div className="mt-8 flex justify-center">
              <button
                type="submit"
                className="h-[50px] w-[140px] rounded-full bg-[#F97316] text-black transition hover:bg-[#fb923c] active:scale-[0.98]"
                style={{ fontFamily: "Geist, sans-serif", fontSize: "18px", fontWeight: 600 }}
              >
                Enter
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Bottom Quote */}
      <div className="absolute bottom-10 left-10">
        <p style={{ fontFamily: "Geist, sans-serif", fontSize: "18px", fontWeight: 500 }}>
          Construction Manager:
        </p>
        <p
          className="mt-1 text-[#F97316]"
          style={{ fontFamily: "'Fira Code', ui-monospace, monospace", fontSize: "16px" }}
        >
          &ldquo;I need KORBAN to figure this out&rdquo;
        </p>
      </div>
    </main>
  );
}

function Logo() {
  return (
    <div className="flex flex-col items-center">
      <svg width="44" height="44" viewBox="0 0 44 44" className="shrink-0">
        <defs>
          <linearGradient id="korbanMark" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FDBA74" />
            <stop offset="100%" stopColor="#F97316" />
          </linearGradient>
        </defs>
        <path d="M22 4 L40 38 L4 38 Z" fill="url(#korbanMark)" />
        <path d="M22 4 L40 38 L22 38 Z" fill="#000000" opacity="0.18" />
      </svg>
      <h1
        className="mt-2 text-center uppercase text-[#F97316]"
        style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: "72px",
          fontWeight: 700,
          letterSpacing: ".14em",
          lineHeight: 1,
        }}
      >
        KORBAN
      </h1>
    </div>
  );
}
