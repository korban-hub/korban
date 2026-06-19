import { getActiveElevation, getActiveProject } from "@/lib/projectStore";

export function formatStoredCount(value: number | null | undefined, fallback = "—") {
  if (value == null || !Number.isFinite(value) || value <= 0) return fallback;
  return value.toLocaleString();
}

export function formatStoredFeet(value: number | null | undefined, fallback = "—") {
  if (value == null || !Number.isFinite(value) || value <= 0) return fallback;
  return `${value.toLocaleString()} LF`;
}

export function getWorkflowDisplayMetrics() {
  const elevation = getActiveElevation();
  const quantities = elevation.quantityEngine;

  return {
    projectName: getActiveProject().projectName || "—",
    levelName: elevation.levelName || "—",
    elevationName: elevation.elevationName || "—",
    linearFeet: elevation.linearFeet,
    wallHeight: elevation.wallHeight,
    bayCount: quantities.bayCount,
    legCount: quantities.legCount,
    frameCount: quantities.frameCount,
    plankCount: quantities.plankCount,
    frameTall: quantities.frameTall,
  };
}
