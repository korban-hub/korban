"use client";

/**
 * The gate.
 *
 * Every working page of Korban needs a signed-in estimator. This sits round
 * the whole app and holds a page back until it knows who is there; with
 * nobody there it sends them to sign in, carrying the page they wanted so
 * they land on it afterwards.
 *
 * Open without an account: the intro, the sign-in and reset pages, and a
 * proposal sent to a customer - they have a link, not a login.
 *
 * This is the door, not the lock. The lock is the database, which refuses
 * to hand over a company's jobs without that company's session whatever a
 * browser does.
 */

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";

const OPEN_PAGES = ["/login", "/reset-password-page", "/present"];

function isOpen(path: string): boolean {
  if (path === "/") return true;
  return OPEN_PAGES.some((page) => path === page || path.startsWith(`${page}/`));
}

function toSignIn() {
  const here = window.location.pathname + window.location.search;
  window.location.replace(`/login?next=${encodeURIComponent(here)}`);
}

export function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const open = isOpen(pathname);
  // "checking" until the session is read; a page is never shown on a guess.
  const [who, setWho] = useState<"checking" | "in" | "out">("checking");

  useEffect(() => {
    let alive = true;
    void supabase.auth.getSession()
      .then(({ data }) => { if (alive) setWho(data.session ? "in" : "out"); })
      .catch(() => { if (alive) setWho("out"); });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (alive) setWho(session ? "in" : "out");
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!open && who === "out") toSignIn();
  }, [open, who]);

  if (open || who === "in") return <>{children}</>;

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-[#070604]">
      <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-600">
        {who === "checking" ? "Korban" : "Taking you to sign in"}
      </p>
    </div>
  );
}
