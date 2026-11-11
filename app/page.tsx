"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * intro/page.tsx
 *
 * KORBAN splash / boot screen.
 * Renders a true 3D tetrahedron (real vertex math, not a CSS clip-path approximation)
 * that tumbles slowly and continuously, with the name lowering in behind it and "w e l c o m e" fading in above the name once it lands.
 * Auto-advances to /login after a few seconds, or on click/tap.
 *
 * Route this as your root page ("/"), and keep your existing login page at "/login".
 */

const AUTO_ADVANCE_MS = 8600;
// The name takes this long to come down and set; "welcome" fades in once it has.
const LAND_MS = 6200;
const WELCOME_FADE_MS = 1300;
const ROTATION_SPEED = 0.0005; // radians per ms — a steady turn you can see: about two thirds of a turn over the intro
const TILT_X = -0.45; // fixed forward tilt, radians

// Regular tetrahedron vertices, apex pointing up (matches reference video)
const VERTS: [number, number, number][] = [
  [0, -1, 0], // apex (top)
  [0.0, 0.3333333, 0.9428090], // base, front
  [-0.8164966, 0.3333333, -0.4714045], // base, back-left
  [0.8164966, 0.3333333, -0.4714045], // base, back-right
];

// Each face as a vertex triple, paired with a brand shade
const FACES: { idx: [number, number, number]; color: string }[] = [
  { idx: [0, 1, 3], color: "#F97316" }, // apex-front-right (bright)
  { idx: [0, 2, 1], color: "#FDBA74" }, // apex-back-front (light)
  { idx: [0, 3, 2], color: "#FB923C" }, // apex-right-back (mid)
  { idx: [1, 2, 3], color: "#EA8A4C" }, // base (rarely visible)
];

function rotateY([x, y, z]: [number, number, number], angle: number): [number, number, number] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [x * c + z * s, y, -x * s + z * c];
}

function rotateX([x, y, z]: [number, number, number], angle: number): [number, number, number] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [x, y * c - z * s, y * s + z * c];
}

function project([x, y, z]: [number, number, number], scale: number, distance: number) {
  const factor = distance / (distance - z);
  return { x: x * factor * scale, y: y * factor * scale, depth: z };
}

export default function IntroPage() {
  const router = useRouter();
  const [fadingOut, setFadingOut] = useState(false);
  const [paths, setPaths] = useState<{ d: string; color: string; key: string }[]>([]);
  const angleRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  useEffect(() => {
    function tick(time: number) {
      if (lastTimeRef.current === null) lastTimeRef.current = time;
      const delta = time - lastTimeRef.current;
      lastTimeRef.current = time;
      angleRef.current += delta * ROTATION_SPEED;

      const scale = 95;
      const distance = 5.4;

      const rotated = VERTS.map((v) => rotateX(rotateY(v, angleRef.current), TILT_X));
      const projected = rotated.map((v) => project(v, scale, distance));

      const facesWithDepth = FACES.map((face) => {
        const avgDepth =
          (rotated[face.idx[0]][2] + rotated[face.idx[1]][2] + rotated[face.idx[2]][2]) / 3;
        const [a, b, c] = face.idx.map((i) => projected[i]);
        const d = `M ${a.x} ${a.y} L ${b.x} ${b.y} L ${c.x} ${c.y} Z`;
        return { d, color: face.color, depth: avgDepth, key: face.idx.join("-") };
      });

      // Painter's algorithm: draw back-to-front so the silhouette always reads correctly
      facesWithDepth.sort((a, b) => a.depth - b.depth);
      setPaths(facesWithDepth);

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFadingOut(true), AUTO_ADVANCE_MS);
    const navTimer = setTimeout(() => router.push("/login"), AUTO_ADVANCE_MS + 600);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(navTimer);
    };
  }, [router]);

  return (
    <main
      onClick={() => router.push("/login")}
      className={`relative flex min-h-screen cursor-pointer flex-col items-center justify-center overflow-hidden bg-[#070604] text-white transition-opacity duration-[600ms] ${
        fadingOut ? "opacity-0" : "opacity-100"
      }`}
    >
      <style>{`
        @keyframes korban-intro-rise {
          0%   { opacity: 0; transform: translateY(-26vh); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes korban-intro-welcome {
          0%   { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes korban-intro-pan {
          0%   { transform: translateX(-14vw); }
          100% { transform: translateX(22vw); }
        }
      `}</style>

      {/* Atmosphere — the glows drift left to right for as long as the intro runs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-[#F97316]/15 blur-[160px]"
          style={{ animation: `korban-intro-pan ${AUTO_ADVANCE_MS + 600}ms linear both` }} />
        <div className="absolute right-[18vw] -top-24 h-[420px] w-[420px] rounded-full bg-[#F97316]/18 blur-[170px]"
          style={{ animation: `korban-intro-pan ${AUTO_ADVANCE_MS + 600}ms linear both` }} />
        <div className="absolute bottom-[-180px] right-[12vw] h-[620px] w-[620px] rounded-full bg-[#F97316]/20 blur-[190px]"
          style={{ animation: `korban-intro-pan ${AUTO_ADVANCE_MS + 600}ms linear both` }} />
      </div>

      {/* The floor: a grid laid flat, running away from the eye and fading into black */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[46vh] overflow-hidden"
        style={{
          perspective: "900px",
          WebkitMaskImage: "linear-gradient(to top, transparent 0%, #000 55%, transparent 100%)",
          maskImage: "linear-gradient(to top, transparent 0%, #000 55%, transparent 100%)",
        }}
      >
        <div
          style={{
            position: "absolute", left: "-50%", right: "-50%", top: 0, height: "320%",
            transform: "rotateX(72deg)", transformOrigin: "50% 0%",
            backgroundImage:
              "linear-gradient(to right, rgba(249,115,22,0.20) 1px, transparent 1px), linear-gradient(to bottom, rgba(249,115,22,0.20) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
      </div>

      {/*
        The name, in a faint white outline, lowering slowly out of the dark behind the mark.
        Drawn first so the tetrahedron and caption sit in front of it.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
        style={{
          // The letters dissolve toward the top, so they read as coming down out of the dark.
          WebkitMaskImage: "linear-gradient(to bottom, transparent 4%, #000 46%)",
          maskImage: "linear-gradient(to bottom, transparent 4%, #000 46%)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-title), 'Barlow Semi Condensed', sans-serif",
            fontWeight: 700,
            fontSize: "25vw",
            lineHeight: 1,
            letterSpacing: "0.02em",
            whiteSpace: "nowrap",
            color: "transparent",
            WebkitTextStroke: "1.5px rgba(255,255,255,0.26)",
            animation: `korban-intro-rise ${LAND_MS}ms cubic-bezier(0.25, 0.5, 0.4, 1) both`,
          }}
        >
          KORBAN
        </span>
      </div>

      {/*
        "welcome", above the name. It waits for the name to land, then fades in
        where it stands - no slide, no drift.
      */}
      <p
        className="pointer-events-none absolute inset-x-0 text-center text-zinc-400"
        style={{
          bottom: "calc(50% + 10.6vw)",
          fontFamily: "var(--font-fira-code), 'Fira Code', ui-monospace, monospace",
          fontSize: "15px",
          letterSpacing: "0.04em",
          animation: `korban-intro-welcome ${WELCOME_FADE_MS}ms ease-out ${LAND_MS}ms both`,
        }}
      >
        w e l c o m e
      </p>

      {/* Rotating tetrahedron — real 3D vertex math rendered as SVG */}
      <svg
        viewBox="-160 -160 320 320"
        width="280"
        height="280"
        className="relative"
        style={{ overflow: "visible" }}
      >
        {paths.map((face) => (
          <path key={face.key} d={face.d} fill={face.color} stroke="none" />
        ))}
      </svg>
    </main>
  );
}
