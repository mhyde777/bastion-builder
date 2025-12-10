// src/utils/openings.ts
import type { CameraState, Wall } from "../types";
import { GRID_SIZE } from "../constants";

export interface WallHit {
  wall: Wall;
  t: number; // 0..1 param along wall segment
}

// Project a wall into screen space (relative to the canvas root)
function wallEndpointsToScreen(
  wall: Wall,
  camera: CameraState
): {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
} {
  const zoom = camera.zoom;
  const scale = GRID_SIZE * zoom;
  const offsetX = camera.offset.x;
  const offsetY = camera.offset.y;

  const x1 = offsetX + wall.x1 * scale;
  const y1 = offsetY + wall.y1 * scale;
  const x2 = offsetX + wall.x2 * scale;
  const y2 = offsetY + wall.y2 * scale;

  return { x1, y1, x2, y2 };
}

// Hit test against a list of walls using distance-to-segment in screen space.
export function hitTestWallAtPoint(
  walls: Wall[],
  clientX: number,
  clientY: number,
  rootRect: DOMRect,
  camera: CameraState
): WallHit | null {
  if (!walls.length) return null;

  // Pointer position relative to the canvas root
  const px = clientX - rootRect.left;
  const py = clientY - rootRect.top;

  let best: WallHit | null = null;
  let bestDist = Infinity;

  for (const wall of walls) {
    const { x1, y1, x2, y2 } = wallEndpointsToScreen(
      wall,
      camera
    );

    const vx = x2 - x1;
    const vy = y2 - y1;
    const wx = px - x1;
    const wy = py - y1;

    const c2 = vx * vx + vy * vy;
    if (c2 === 0) continue;

    let t = (vx * wx + vy * wy) / c2;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;

    const cx = x1 + t * vx;
    const cy = y1 + t * vy;
    const dx = px - cx;
    const dy = py - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Hit threshold scales with zoom
    const thickness = (GRID_SIZE * camera.zoom) / 6;
    const hitThreshold = thickness * 1.2;

    if (dist <= hitThreshold && dist < bestDist) {
      bestDist = dist;
      best = { wall, t };
    }
  }

  return best;
}

// Convert a t-range on a wall into integer segment indices.
export function openingSegmentRange(
  wall: Wall,
  tStart: number,
  tCurrent: number
): { segStart: number; segEnd: number } | null {
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const lengthCells = Math.sqrt(dx * dx + dy * dy);
  if (!Number.isFinite(lengthCells) || lengthCells <= 0) {
    return null;
  }

  let t0 = tStart;
  let t1 = tCurrent;
  if (t0 > t1) {
    const tmp = t0;
    t0 = t1;
    t1 = tmp;
  }

  // Clamp to [0,1]
  t0 = Math.max(0, Math.min(1, t0));
  t1 = Math.max(0, Math.min(1, t1));

  const rawStart = t0 * lengthCells;
  const rawEnd = t1 * lengthCells;

  const segStart = Math.floor(rawStart);
  const segEnd = Math.ceil(rawEnd);

  if (segEnd <= segStart) {
    return null;
  }

  return { segStart, segEnd };
}

// Opening rectangle as a rotated segment in screen space.
export function computeOpeningRectOnWall(
  wall: Wall,
  segStart: number,
  segEnd: number,
  camera: CameraState
): {
  left: number;
  top: number;
  width: number;
  height: number;
  angleDeg: number;
} {
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const lengthCells = Math.sqrt(dx * dx + dy * dy);
  if (!Number.isFinite(lengthCells) || lengthCells <= 0) {
    return { left: 0, top: 0, width: 0, height: 0, angleDeg: 0 };
  }

  const zoom = camera.zoom;
  const scale = GRID_SIZE * zoom;
  const offsetX = camera.offset.x;
  const offsetY = camera.offset.y;

  const t0 = segStart / lengthCells;
  const t1 = segEnd / lengthCells;

  const gx1 = wall.x1 + dx * t0;
  const gy1 = wall.y1 + dy * t0;
  const gx2 = wall.x1 + dx * t1;
  const gy2 = wall.y1 + dy * t1;

  const x1 = offsetX + gx1 * scale;
  const y1 = offsetY + gy1 * scale;
  const x2 = offsetX + gx2 * scale;
  const y2 = offsetY + gy2 * scale;

  const sx = x2 - x1;
  const sy = y2 - y1;
  const lengthPx = Math.sqrt(sx * sx + sy * sy);

  const angleRad = Math.atan2(sy, sx);
  const angleDeg = (angleRad * 180) / Math.PI;

  // Slightly thinner than walls
  const thickness = (GRID_SIZE * zoom) / 8;

  return {
    left: x1,
    top: y1 - thickness / 2,
    width: lengthPx,
    height: thickness,
    angleDeg,
  };
}

