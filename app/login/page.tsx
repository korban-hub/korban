"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

type Mode = "signIn" | "reset";

/**
 * Where the estimator was headed when Korban asked them to sign in. Only a
 * page inside Korban is accepted - never an address on another site.
 */
function whereNext(): string {
  try {
    const next = new URLSearchParams(window.location.search).get("next") ?? "";
    if (next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/login")) return next;
  } catch { /* fall through */ }
  return "/trades-panel";
}

const MONO = "var(--font-fira-code), 'Fira Code', ui-monospace, monospace";
const ORANGE = "#F97316";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused] = useState<"email" | "password" | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  function switchMode(next: Mode) { setMode(next); setMessage(null); }

  function validate(): string | null {
    if (!email.trim()) return "Enter your email address.";
    if (!/\S+@\S+\.\S+/.test(email)) return "Enter a valid email address.";
    if (mode === "signIn" && !password) return "Enter your password.";
    return null;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    const validationError = validate();
    if (validationError) { setMessage({ type: "error", text: validationError }); return; }
    setLoading(true);
    try {
      if (mode === "signIn") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.href = whereNext();
        return;
      }
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password-page` });
      if (error) throw error;
      setMessage({ type: "success", text: "Reset link sent. Check your email." });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Something went wrong. Try again." });
    } finally {
      setLoading(false);
    }
  }

  // One row of the box: a short orange label, then the field.
  const rowStyle = (name: "email" | "password"): React.CSSProperties => ({
    display: "flex", alignItems: "center", gap: 14, marginTop: 10, padding: "0 14px", height: 46,
    border: `1px solid ${focused === name ? ORANGE : "#27272a"}`,
    boxShadow: focused === name ? "0 0 0 3px rgba(249,115,22,.12)" : "none",
    transition: "border-color .15s, box-shadow .15s",
  });
  const labelStyle: React.CSSProperties = { width: 64, flex: "none", color: ORANGE, fontSize: 10, letterSpacing: ".18em", textTransform: "uppercase" };
  const inputStyle: React.CSSProperties = { flex: 1, minWidth: 0, background: "transparent", border: 0, outline: "none", color: "#e4e4e7", fontFamily: MONO, fontSize: 14, caretColor: ORANGE };

  return (
    <main style={{ position: "relative", minHeight: "100vh", width: "100%", background: "#060606", color: "#fff", fontFamily: MONO, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 24px 58px" }}>
      <Logo />

      <form onSubmit={handleSubmit} style={{ width: "100%", maxWidth: 440, marginTop: 30, border: "1px solid #27272a", background: "#0b0b0c" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid #27272a", fontSize: 10, letterSpacing: ".2em", textTransform: "uppercase", color: "#71717a" }}>
          <span>{mode === "signIn" ? "Sign in" : "Reset password"}</span>
          <span style={{ color: ORANGE }}>{mode === "signIn" ? "01 / Access" : "02 / Recover"}</span>
        </div>

        <div style={{ padding: "20px 28px 24px" }}>
          <label style={rowStyle("email")}>
            <span style={labelStyle}>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus
              onFocus={() => setFocused("email")} onBlur={() => setFocused(null)} style={inputStyle} />
          </label>

          {mode === "signIn" && (
            <label style={rowStyle("password")}>
              <span style={labelStyle}>Pass</span>
              <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
                onFocus={() => setFocused("password")} onBlur={() => setFocused(null)} style={inputStyle} />
              <button type="button" onClick={() => setShowPassword((v) => !v)}
                style={{ background: "none", border: 0, cursor: "pointer", color: "#71717a", fontFamily: MONO, fontSize: 9, letterSpacing: ".2em", textTransform: "uppercase" }}>
                {showPassword ? "Hide" : "Show"}
              </button>
            </label>
          )}

          {message && (
            <p style={{ marginTop: 14, fontSize: 11, lineHeight: 1.6, color: message.type === "error" ? "#f87171" : "#34d399" }}>{message.text}</p>
          )}

          <button type="submit" disabled={loading}
            style={{ marginTop: 18, width: "100%", height: 44, border: `1px solid ${ORANGE}`, background: "rgba(249,115,22,.08)", color: ORANGE, cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1, fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: ".3em", textTransform: "uppercase" }}>
            {loading ? "Working" : mode === "signIn" ? "Enter →" : "Send reset link →"}
          </button>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, fontSize: 10, letterSpacing: ".08em", color: "#52525b" }}>
            <button type="button" onClick={() => switchMode(mode === "signIn" ? "reset" : "signIn")}
              style={{ background: "none", border: 0, padding: 0, cursor: "pointer", color: "#71717a", fontFamily: MONO, fontSize: 10, letterSpacing: ".08em" }}>
              {mode === "signIn" ? "Forgot password?" : "← Back to sign in"}
            </button>
            <span>Scaffold intelligence platform</span>
          </div>
        </div>
      </form>

      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 34, borderTop: "1px solid #18181b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, letterSpacing: ".16em", textTransform: "uppercase", color: "#52525b" }}>
        &ldquo;I need Korban to figure this out&rdquo;
      </div>
    </main>
  );
}

function Logo() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg width="30" height="30" viewBox="0 0 44 44">
        <path d="M22 4 L40 38 L4 38 Z" fill={ORANGE} />
        <path d="M22 4 L40 38 L22 38 Z" fill="#000000" opacity="0.2" />
      </svg>
      <h1 style={{ marginTop: 10, color: ORANGE, fontFamily: "var(--font-title), 'Barlow Semi Condensed', sans-serif", fontSize: 26, fontWeight: 700, letterSpacing: ".34em", paddingLeft: ".34em", textTransform: "uppercase", lineHeight: 1 }}>
        Korban
      </h1>
    </div>
  );
}
