/**
 * scaffoldScene.ts
 *
 * The scaffold model as three.js objects.
 *
 * scaffoldModel.ts says what is in the air - every post, plank, rail, hatch
 * deck and run of netting, in feet. This file turns that list into meshes:
 * one unit tube and one unit box stamped once per piece, planks and decks as
 * boxes, netting and planked gaps as quads. Nothing here decides what a
 * scaffold is; it only draws the list it is handed.
 *
 * Two views draw the same job: the working model on Set Scaffold and the
 * model on the proposal. They differ only in palette - steel and wood on a
 * grey ground for the estimator, the same steel under orange light for the
 * customer - so the palette is a parameter and the stamping is shared.
 */

import * as THREE from "three";
import type { PartKind, ScaffoldModel, Vec3 } from "@/lib/scaffoldModel";

/** One foot is 0.3 scene units - the scale the first model drew a frame at. */
export const FEET = 0.3;

export type ScenePalette = Record<PartKind, THREE.Material>;

export function steelMaterial(color: number, roughness = 0.3): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, metalness: 0.8, roughness });
}

export function woodMaterial(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
}

/**
 * Debris netting: a black mesh you can see through. A small canvas of thin
 * lines, repeated by real size, on a transparent two-sided sheet.
 */
export function nettingMaterial(): THREE.Material {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  if (g) {
    g.clearRect(0, 0, 64, 64);
    g.strokeStyle = "rgba(10,10,12,0.85)";
    g.lineWidth = 1.2;
    for (let i = 0; i <= 64; i += 8) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 64); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(64, i); g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, color: 0x0b0b0d });
}

/** The working palette: steel, wood, green brackets, as on the plan. */
export function workingPalette(): ScenePalette {
  return {
    post: steelMaterial(0xc4c8cc), ledger: steelMaterial(0xb4b9be), brace: steelMaterial(0x8f979f, 0.4), rail: steelMaterial(0xd8dde2),
    jack: steelMaterial(0x9aa3ad, 0.5), plate: steelMaterial(0x6b7480, 0.7), guardPost: steelMaterial(0xc4c8cc),
    bracket: steelMaterial(0x4ade80, 0.4), bracketPlank: woodMaterial(0x86efac),
    plank: woodMaterial(0x8a6a2a), hatchBoard: steelMaterial(0x8fa3b8, 0.5), hatchDoor: steelMaterial(0xb7c7d8, 0.5), ladder: steelMaterial(0xc9d3dc, 0.45),
    // The canopy frame reads warm, the way it is marked on the plan.
    canopy: steelMaterial(0xd9a441, 0.4),
    netting: nettingMaterial(),
  };
}

/**
 * The proposal palette: the same steel and wood, warmer, with the rails lit
 * orange - the top lift reads as a line of light round the building.
 */
export function proposalPalette(): ScenePalette {
  const hotRail = new THREE.MeshStandardMaterial({ color: 0xfb923c, emissive: 0xf97316, emissiveIntensity: 0.85, metalness: 0.3, roughness: 0.4 });
  return {
    post: steelMaterial(0xd9d2c8, 0.35), ledger: steelMaterial(0xc9c1b6, 0.35), brace: steelMaterial(0x8c8780, 0.45), rail: hotRail,
    jack: steelMaterial(0x8e939a, 0.5), plate: steelMaterial(0x5f666e, 0.7), guardPost: steelMaterial(0xd9d2c8, 0.35),
    bracket: steelMaterial(0x4ade80, 0.4), bracketPlank: woodMaterial(0x86efac),
    plank: woodMaterial(0x9a6f2c), hatchBoard: steelMaterial(0x9aa2ab, 0.5), hatchDoor: steelMaterial(0xb9c0c8, 0.5), ladder: steelMaterial(0xcfd5db, 0.45),
    canopy: steelMaterial(0xcfc1a8, 0.4),
    netting: nettingMaterial(),
  };
}

export type SceneBuild = {
  group: THREE.Group;
  /** Middle of the job, scene units. */
  center: THREE.Vector3;
  size: THREE.Vector3;
  /** A camera distance that frames the whole job. */
  camDist: number;
  dispose: () => void;
};

/**
 * Stamps the model into a group. The caller owns the palette's materials;
 * dispose() frees the geometry this made and nothing else.
 */
export function buildScaffoldGroup(
  model: ScaffoldModel,
  palette: ScenePalette,
  opts: { wallMaterial?: THREE.Material; scale?: number } = {},
): SceneBuild {
  const S = opts.scale ?? FEET;
  const group = new THREE.Group();
  const owned: { dispose(): void }[] = [];

  // Planked gaps and decks drawn as quads take the part's colour, matte and two-sided.
  const quadMat: Partial<Record<PartKind, THREE.Material>> = {};
  const quadMatFor = (part: PartKind) => {
    if (!quadMat[part]) {
      const base = palette[part] as THREE.MeshStandardMaterial;
      const m = new THREE.MeshStandardMaterial({ color: base.color, roughness: 0.9, side: THREE.DoubleSide });
      if (base.emissive) { m.emissive = base.emissive.clone(); m.emissiveIntensity = base.emissiveIntensity; }
      quadMat[part] = m;
      owned.push(m);
    }
    return quadMat[part]!;
  };

  const tubeGeo = new THREE.CylinderGeometry(1, 1, 1, 6);
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  owned.push(tubeGeo, boxGeo);
  const tubes = new Map<PartKind, THREE.Matrix4[]>();
  const boxes = new Map<PartKind, THREE.Matrix4[]>();
  const quads = new Map<PartKind, number[]>();
  const quadUvs = new Map<PartKind, number[]>();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3(), q = new THREE.Quaternion(), scl = new THREE.Vector3(), dir = new THREE.Vector3();
  const V = (p: Vec3) => new THREE.Vector3(p.x * S, p.y * S, p.z * S);

  for (const piece of model.pieces) {
    if (piece.kind === "tube") {
      const a = V(piece.a), b = V(piece.b);
      dir.subVectors(b, a);
      const len = dir.length();
      if (len < 1e-6) continue;
      dir.divideScalar(len);
      pos.addVectors(a, b).multiplyScalar(0.5);
      q.setFromUnitVectors(up, dir);
      scl.set(piece.r * S, len, piece.r * S);
      (tubes.get(piece.part) ?? tubes.set(piece.part, []).get(piece.part)!).push(new THREE.Matrix4().compose(pos, q, scl));
    } else if (piece.kind === "box") {
      pos.copy(V(piece.c));
      q.setFromAxisAngle(up, piece.yaw);
      scl.set(piece.len * S, piece.thick * S, piece.wid * S);
      (boxes.get(piece.part) ?? boxes.set(piece.part, []).get(piece.part)!).push(new THREE.Matrix4().compose(pos, q, scl));
    } else {
      const [p0, p1, p2, p3] = piece.p.map(V);
      const list = quads.get(piece.part) ?? quads.set(piece.part, []).get(piece.part)!;
      list.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p0.x, p0.y, p0.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
      // Texture repeats by real size (one tile per 2'), so netting mesh reads the same on every sheet.
      const u = p0.distanceTo(p1) / (2 * S), v = p1.distanceTo(p2) / (2 * S);
      const uvs = quadUvs.get(piece.part) ?? quadUvs.set(piece.part, []).get(piece.part)!;
      uvs.push(0, 0, u, 0, u, v, 0, 0, u, v, 0, v);
    }
  }

  const stamp = (geo: THREE.BufferGeometry, byPart: Map<PartKind, THREE.Matrix4[]>) => {
    byPart.forEach((mats, part) => {
      const mesh = new THREE.InstancedMesh(geo, palette[part], mats.length);
      mats.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.instanceMatrix.needsUpdate = true;
      group.add(mesh);
    });
  };
  stamp(tubeGeo, tubes);
  stamp(boxGeo, boxes);
  quads.forEach((verts, part) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(quadUvs.get(part) ?? [], 2));
    geo.computeVertexNormals();
    owned.push(geo);
    const mesh = new THREE.Mesh(geo, part === "netting" ? palette.netting : quadMatFor(part));
    if (part === "netting") mesh.renderOrder = 2;
    group.add(mesh);
  });

  // The building: each wall at its own height.
  const wallMat = opts.wallMaterial ?? (() => { const m = new THREE.MeshStandardMaterial({ color: 0x5a616b, roughness: 0.9 }); owned.push(m); return m; })();
  for (const w of model.walls) {
    const dx = (w.b.x - w.a.x) * S, dz = (w.b.z - w.a.z) * S;
    const len = Math.hypot(dx, dz);
    if (len < 1e-3 || w.heightFt <= 0) continue;
    const h = w.heightFt * S;
    const geo = new THREE.BoxGeometry(len, h, 0.5 * S);
    owned.push(geo);
    const wall = new THREE.Mesh(geo, wallMat);
    wall.position.set((w.a.x + w.b.x) / 2 * S, h / 2, (w.a.z + w.b.z) / 2 * S);
    wall.rotation.y = -Math.atan2(dz, dx);
    group.add(wall);
  }

  const bbox = new THREE.Box3().setFromObject(group);
  const center = bbox.getCenter(new THREE.Vector3());
  const size = bbox.getSize(new THREE.Vector3());
  const camDist = Math.max(size.x, size.z, size.y * 1.5) * 1.35 + 5;

  return {
    group, center, size, camDist,
    dispose: () => { owned.forEach(o => o.dispose()); },
  };
}

/** Frees a palette's materials and any textures they hold. */
export function disposePalette(palette: ScenePalette) {
  Object.values(palette).forEach(m => {
    const map = (m as THREE.MeshBasicMaterial).map;
    if (map) map.dispose();
    m.dispose();
  });
}
