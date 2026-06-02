"use client";

import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function AuthForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [message, setMessage] = useState("");

  async function handleAuth() {
    setLoading(true);
    setMessage("");

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        window.location.href = "/dashboard";
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) throw error;

        window.location.href = "/dashboard";
      }
    } catch (error: any) {
      setMessage(error.message);
    }

    setLoading(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <input
        type="email"
        placeholder="you@company.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded-full border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none transition focus:border-orange-500"
      />

      <input
        type="password"
        placeholder="••••••••"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full rounded-full border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none transition focus:border-orange-500"
      />

      <button
        onClick={handleAuth}
        disabled={loading}
        className="mt-2 rounded-full bg-orange-500 py-3 text-base font-semibold text-black transition hover:bg-orange-400 disabled:opacity-60"
      >
        {loading ? "Working..." : isLogin ? "Enter" : "Create Account"}
      </button>

      <div className="flex justify-between pt-1 text-xs">
        <button type="button" className="text-neutral-400 hover:text-orange-400">
          Forgot password?
        </button>

        <button
          type="button"
          onClick={() => {
            setIsLogin(!isLogin);
            setMessage("");
          }}
          className="text-orange-400 hover:text-orange-300"
        >
          {isLogin ? "Create account" : "Back to login"}
        </button>
      </div>

      {message && <p className="text-xs text-neutral-400">{message}</p>}
    </div>
  );
}