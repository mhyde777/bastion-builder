// src/utils/openings.ts
import type { CameraState, Door, Wall, WindowOpening } from "../types";
import { GRID_SIZE } from "../constants";
import { gridToScreenRect } from "./camera";

export interface WallHit {
  wall: Wall;
  t: number; // 0–1 along wall
}

// Hit test in screen space: pick nearest wall within a pixel threshold.
export function hitTestWallAtPoint(
  walls: Wall[],
  clientX: number,
  clientY: number,
  rootRect: DOMRect,
  camera: CameraState,
  pixelThreshold: number = 6
): WallHit | null {
  let best: { wall: Wall; t: number; dist: number } | null = null;

  for (const wall of walls) {
    const rect = wallToScreenRect(wall, camera);
    const centerLineInfo = distanceToWallRect(
      rect,
      clientX - rootRect.left,
      clientY - rootRect.top
    );
    if (centerLineInfo.dist <= pixelThreshold) {
      if (!best || centerLineInfo.dist < best.dist) {
        best = {
          wall,
          t: centerLineInfo.t,
          dist: centerLineInfo.dist,
        };
      }
    }
  }

  if (!best) return null;
  return { wall: best.wall, t: best.t };
}

function wallToScreenRect(
  wall: Wall,
  camera: CameraState
): { left: number; top: number; width: number; height: number } {
  const thickness = (GRID_SIZE * camera.zoom) / 6; // visual wall thickness
  if (wall.y1 === wall.y2) {
    // horizontal
    const base = gridToScreenRect(
      wall.x1,
      wall.y1,
      wall.x2,
      wall.y1,
      camera
    );
    return {
      left: base.left,
      top: base.top - thickness / 2,
      width: base.width,
      height: thickness,
    };
  } else {
    // vertical
    const base = gridToScreenRect(
      wall.x1,
      wall.y1,
      wall.x1,
      wall.y2,
      camera
    );
    return {
      left: base.left - thickness / 2,
      top: base.top,
      width: thickness,
      height: base.height,
    };
  }
}

function distanceToWallRect(
  wallRect: { left: number; top: number; width: number; height: number },
  x: number,
  y: number
): { dist: number; t: number } {
  const cx = clamp(
    x,
    wallRect.left,
    wallRect.left + wallRect.width
  );
  const cy = clamp(
    y,
    wallRect.top,
    wallRect.top + wallRect.height
  );
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // t along wall (0–1)
  let t: number;
  if (wallRect.width >= wallRect.height) {
    // treat as horizontal
    const len = wallRect.width || 1;
    t = len ? (cx - wallRect.left) / len : 0;
  } else {
    const len = wallRect.height || 1;
    t = len ? (cy - wallRect.top) / len : 0;
  }

  return { dist, t };
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

// Convert [segStart, segEnd) into a screen rect to draw
export function computeOpeningRectOnWall(
  wall: Wall,
  segStart: number,
  segEnd: number,
  camera: CameraState
): { left: number; top: number; width: number; height: number } {
  const thicknessFactor = 0.5; // thinner than wall

  if (wall.y1 === wall.y2) {
    // horizontal wall
    const y = wall.y1;
    const xStart = wall.x1 + segStart;
    const xEnd = wall.x1 + segEnd;

    const base = gridToScreenRect(
      xStart,
      y,
      xEnd,
      y,
      camera
    );
    const thickness =
      (GRID_SIZE * camera.zoom) * thicknessFactor;

    return {
      left: base.left,
      top: base.top - thickness / 2,
      width: base.width,
      height: thickness,
    };
  } else {
    // vertical wall
    const x = wall.x1;
    const yStart = wall.y1 + segStart;
    const yEnd = wall.y1 + segEnd;

    const base = gridToScreenRect(
      x,
      yStart,
      x,
      yEnd,
      camera
    );
    const thickness =
      (GRID_SIZE * camera.zoom) * thicknessFactor;

    return {
      left: base.left - thickness / 2,
      top: base.top,
      width: thickness,
      height: base.height,
    };
  }
}

// Given start and current t along wall, compute integer segment range.
export function openingSegmentRange(
  wall: Wall,
  tStart: number,
  tCurrent: number
): { segStart: number; segEnd: number } | null {
  const length =
    wall.x1 === wall.x2
      ? Math.abs(wall.y2 - wall.y1)
      : Math.abs(wall.x2 - wall.x1);

  if (length === 0) return null;

  const segmentStart = Math.floor(Math.min(tStart, tCurrent) * length);
  const segmentEnd = Math.ceil(Math.max(tStart, tCurrent) * length);

  if (segmentEnd <= segmentStart) return null;
  return { segStart: segmentStart, segEnd: segmentEnd };
}

