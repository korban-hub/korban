"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

type Mode = "signIn" | "signUp" | "reset";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  function resetMessage() { setMessage(null); }
  function switchMode(next: Mode) { setMode(next); resetMessage(); }

  function validate(): string | null {
    if (!email.trim()) return "Enter your email address.";
    if (!/\S+@\S+\.\S+/.test(email)) return "Enter a valid email address.";
    if (mode !== "reset") {
      if (!password) return "Enter your password.";
      if (mode === "signUp" && password.length < 6) return "Password must be at least 6 characters.";
    }
    return null;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    resetMessage();
    const validationError = validate();
    if (validationError) { setMessage({ type: "error", text: validationError }); return; }
    setLoading(true);
    try {
      if (mode === "signIn") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.href = "/dashboard";
        return;
      }
      if (mode === "signUp") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage({ type: "success", text: "Account created. Check your email to confirm before signing in." });
        setMode("signIn");
        return;
      }
      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
        if (error) throw error;
        setMessage({ type: "success", text: "Password reset link sent. Check your email." });
        return;
      }
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Something went wrong. Try again." });
    } finally {
      setLoading(false);
    }
  }

  const heading = mode === "signIn" ? "Sign In" : mode === "signUp" ? "Create Account" : "Reset Password";
  const buttonLabel = loading ? "Working..." : mode === "signIn" ? "Enter" : mode === "signUp" ? "Create Account" : "Send Reset Link";

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
          <Logo />

          <p className="mt-4 text-center uppercase text-[#A1A1AA]"
            style={{ fontFamily: "'Fira Code', ui-monospace, monospace", fontSize: "12px", letterSpacing: ".30em" }}>
            Scaffold Intelligence Platform
          </p>

          <p className="mt-10 text-center uppercase text-orange-400"
            style={{ fontFamily: "ui-monospace, monospace", fontSize: "11px", letterSpacing: ".2em" }}>
            {heading}
          </p>

          <form onSubmit={handleSubmit} className="mt-4 w-full">
            <div>
              <label htmlFor="email" className="mb-2 block text-white"
                style={{ fontFamily: "Geist, sans-serif", fontSize: "14px", fontWeight: 500 }}>
                Email
              </label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="estimator@korban.com" autoComplete="email"
                className="h-[52px] w-full rounded-full border border-white/25 bg-white/[0.02] px-6 text-sm text-[#F97316] outline-none transition placeholder:text-zinc-600 focus:border-[#F97316]/60 focus:bg-white/[0.04]"
                style={{ fontFamily: "'Fira Code', ui-monospace, monospace" }} />
            </div>

            {mode !== "reset" && (
              <div className="mt-5">
                <label htmlFor="password" className="mb-2 block text-white"
                  style={{ fontFamily: "Geist, sans-serif", fontSize: "14px", fontWeight: 500 }}>
                  Password
                </label>
                <div className="relative">
                  <input id="password" type={showPassword ? "text" : "password"} value={password}
                    onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                    autoComplete={mode === "signUp" ? "new-password" : "current-password"}
                    className="h-[52px] w-full rounded-full border border-white/25 bg-white/[0.02] px-6 pr-14 text-sm text-[#F97316] outline-none transition placeholder:text-zinc-600 focus:border-[#F97316]/60 focus:bg-white/[0.04]"
                    style={{ fontFamily: "'Fira Code', ui-monospace, monospace" }} />
                  <button type="button" onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-5 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-wider text-zinc-500 hover:text-[#F97316]">
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
            )}

            {mode === "signIn" && (
              <div className="mt-3 flex justify-end">
                <button type="button" onClick={() => switchMode("reset")}
                  className="text-xs text-zinc-500 underline-offset-4 hover:text-[#F97316] hover:underline">
                  Forgot password?
                </button>
              </div>
            )}

            {message && (
              <p className={`mt-4 text-center text-xs ${message.type === "error" ? "text-red-400" : "text-emerald-400"}`}>
                {message.text}
              </p>
            )}

            <div className="mt-8 flex justify-center">
              <button type="submit" disabled={loading}
                className="h-[50px] min-w-[160px] rounded-full bg-[#F97316] px-6 text-black transition hover:bg-[#fb923c] active:scale-[0.98] disabled:opacity-60"
                style={{ fontFamily: "Geist, sans-serif", fontSize: "16px", fontWeight: 600 }}>
                {buttonLabel}
              </button>
            </div>

            <div className="mt-6 text-center">
              {mode === "signIn" && (
                <button type="button" onClick={() => switchMode("signUp")}
                  className="text-xs text-zinc-500 hover:text-[#F97316]">
                  Don&rsquo;t have an account? <span className="text-[#F97316]">Create one</span>
                </button>
              )}
              {mode === "signUp" && (
                <button type="button" onClick={() => switchMode("signIn")}
                  className="text-xs text-zinc-500 hover:text-[#F97316]">
                  Already have an account? <span className="text-[#F97316]">Sign in</span>
                </button>
              )}
              {mode === "reset" && (
                <button type="button" onClick={() => switchMode("signIn")}
                  className="text-xs text-zinc-500 hover:text-[#F97316]">
                  Back to sign in
                </button>
              )}
            </div>

            {/* Demo entry — discreet, sign in screen only */}
            {mode === "signIn" && (
              <div className="mt-8 flex flex-col items-center gap-2">
                <div className="flex w-full items-center gap-3">
                  <div className="h-px flex-1 bg-white/8" />
                  <span className="text-[9px] uppercase tracking-[0.2em] text-zinc-700">or</span>
                  <div className="h-px flex-1 bg-white/8" />
                </div>
                <button
                  type="button"
                  onClick={() => { window.location.href = "/dashboard"; }}
                  className="text-[11px] text-zinc-600 transition hover:text-zinc-400"
                  style={{ fontFamily: "ui-monospace, monospace", letterSpacing: ".05em" }}
                >
                  enter demo →
                </button>
              </div>
            )}
          </form>
        </div>
      </div>

      {/* Bottom Quote */}
      <div className="absolute bottom-10 left-10">
        <p style={{ fontFamily: "Geist, sans-serif", fontSize: "18px", fontWeight: 500 }}>
          Construction Manager:
        </p>
        <p className="mt-1 text-[#F97316]"
          style={{ fontFamily: "'Fira Code', ui-monospace, monospace", fontSize: "16px" }}>
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
      <h1 className="mt-2 text-center uppercase text-[#F97316]"
        style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "72px", fontWeight: 700, letterSpacing: ".14em", lineHeight: 1 }}>
        KORBAN
      </h1>
    </div>
  );
}
