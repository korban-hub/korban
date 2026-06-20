"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * reset-password/page.tsx
 *
 * Where a user lands after clicking the password reset link emailed to
 * them by the "Forgot password?" flow on the login page. Supabase
 * automatically authenticates them via the link's token when they arrive
 * here — this page just asks for and saves their new password.
 */

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  // Supabase needs a moment to process the reset-link session on arrival.
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
      }
    });

    // Fallback: if the session is already present (e.g. fast reload), allow through.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  function validate(): string | null {
    if (!password) return "Enter a new password.";
    if (password.length < 6) return "Password must be at least 6 characters.";
    if (password !== confirmPassword) return "Passwords don't match.";
    return null;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);

    const validationError = validate();
    if (validationError) {
      setMessage({ type: "error", text: validationError });
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      setMessage({ type: "success", text: "Password updated. Redirecting to sign in..." });
      window.setTimeout(() => {
        window.location.href = "/login";
      }, 1800);
    } catch (error) {
      const text = error instanceof Error ? error.message : "Something went wrong. Try again.";
      setMessage({ type: "error", text });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070604] text-white">
      {/* Atmosphere — matches login page */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-[#F97316]/15 blur-[160px]" />
        <div className="absolute -right-32 -top-24 h-[420px] w-[420px] rounded-full bg-[#F97316]/18 blur-[170px]" />
        <div className="absolute bottom-[-180px] right-[-80px] h-[620px] w-[620px] rounded-full bg-[#F97316]/20 blur-[190px]" />
        <div className="absolute inset-0 opacity-[0.035] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      <div className="relative flex min-h-screen flex-col items-center justify-center px-6">
        <div className="flex w-full max-w-[400px] flex-col items-center">
          <Logo />

          <p
            className="mt-10 text-center uppercase text-orange-400"
            style={{ fontFamily: "ui-monospace, monospace", fontSize: "11px", letterSpacing: ".2em" }}
          >
            Set New Password
          </p>

          {!ready ? (
            <p className="mt-8 text-center text-sm text-zinc-500">
              Verifying your reset link...
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="mt-4 w-full">
              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block text-white"
                  style={{ fontFamily: "Geist, sans-serif", fontSize: "14px", fontWeight: 500 }}
                >
                  New Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
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

              <div className="mt-5">
                <label
                  htmlFor="confirmPassword"
                  className="mb-2 block text-white"
                  style={{ fontFamily: "Geist, sans-serif", fontSize: "14px", fontWeight: 500 }}
                >
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className="h-[52px] w-full rounded-full border border-white/25 bg-white/[0.02] px-6 text-sm text-[#F97316] outline-none transition placeholder:text-zinc-600 focus:border-[#F97316]/60 focus:bg-white/[0.04]"
                  style={{ fontFamily: "'Fira Code', ui-monospace, monospace" }}
                />
              </div>

              {message && (
                <p
                  className={`mt-4 text-center text-xs ${
                    message.type === "error" ? "text-red-400" : "text-emerald-400"
                  }`}
                >
                  {message.text}
                </p>
              )}

              <div className="mt-8 flex justify-center">
                <button
                  type="submit"
                  disabled={loading}
                  className="h-[50px] min-w-[160px] rounded-full bg-[#F97316] px-6 text-black transition hover:bg-[#fb923c] active:scale-[0.98] disabled:opacity-60"
                  style={{ fontFamily: "Geist, sans-serif", fontSize: "16px", fontWeight: 600 }}
                >
                  {loading ? "Saving..." : "Update Password"}
                </button>
              </div>
            </form>
          )}
        </div>
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
