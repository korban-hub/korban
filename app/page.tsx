"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * intro/page.tsx
 *
 * KORBAN splash / boot screen.
 * Renders a true 3D tetrahedron (real vertex math, not a CSS clip-path approximation)
 * that tumbles slowly and continuously, with a "( Clock In... )" caption beneath it.
 * Auto-advances to /login after a few seconds, or on click/tap.
 *
 * Route this as your root page ("/"), and keep your existing login page at "/login".
 */

const AUTO_ADVANCE_MS = 5200;
const ROTATION_SPEED = 0.00018; // radians per ms — slow, deliberate tumble
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
      {/* Atmosphere — matches login page */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-[#F97316]/15 blur-[160px]" />
        <div className="absolute -right-32 -top-24 h-[420px] w-[420px] rounded-full bg-[#F97316]/18 blur-[170px]" />
        <div className="absolute bottom-[-180px] right-[-80px] h-[620px] w-[620px] rounded-full bg-[#F97316]/20 blur-[190px]" />
      </div>

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

      {/* Caption */}
      <p
        className="relative mt-10 text-zinc-400"
        style={{
          fontFamily: "'Fira Code', ui-monospace, monospace",
          fontSize: "15px",
          letterSpacing: "0.04em",
        }}
      >
        ( Clock In&hellip; )
      </p>
    </main>
  );
}
