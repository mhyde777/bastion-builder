// src/utils/openings.ts
import type { Wall } from "../types/bastion";

export type HitTestResult = {
  wall: Wall;
  t: number;
  segmentIndex: number;
  segments: number;
};

export type HitTestOptions = {
  walls: Wall[];
  cellSize: number;
  offset: { x: number; y: number };
  rootRect: DOMRect;
  specificWallId?: string;
};

/**
 * Hit-test walls at a screen point.
 * This is a direct extraction of the original hitTestWall logic,
 * factored to use explicit options instead of capturing from Canvas.
 */
export function hitTestWallAtPoint(
  clientX: number,
  clientY: number,
  {
    walls,
    cellSize,
    offset,
    rootRect,
    specificWallId,
  }: HitTestOptions
): HitTestResult | null {
  const localX = clientX - rootRect.left;
  const localY = clientY - rootRect.top;

  const tolerancePx = 8;

  const testWalls = specificWallId
    ? walls.filter((w) => w.id === specificWallId)
    : walls;

  for (const wall of testWalls) {
    const x1 = wall.x1 * cellSize + offset.x;
    const y1 = wall.y1 * cellSize + offset.y;
    const x2 = wall.x2 * cellSize + offset.x;
    const y2 = wall.y2 * cellSize + offset.y;

    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length === 0) continue;

    const t =
      ((localX - x1) * dx + (localY - y1) * dy) / (length * length);

    if (t < 0 || t > 1) continue;

    const projX = x1 + t * dx;
    const projY = y1 + t * dy;

    const dist = Math.sqrt(
      (projX - localX) * (projX - localX) +
        (projY - localY) * (projY - localY)
    );

    if (dist > tolerancePx) continue;

    const segments = Math.max(1, Math.round(length / cellSize));
    const segmentIndex = Math.min(
      segments - 1,
      Math.max(0, Math.floor(t * segments))
    );

    return {
      wall,
      t,
      segmentIndex,
      segments,
    };
  }

  return null;
}

export type OpeningRect = {
  cx: number;
  cy: number;
  width: number;
  height: number;
};

export type OpeningRectOptions = {
  cellSize: number;
  offset: { x: number; y: number };
};

/**
 * Compute a door/window rectangle along a wall.
 * Direct extraction of the original computeOpeningRect helper.
 */
export function computeOpeningRectOnWall(
  wall: Wall,
  segStart: number,
  segEnd: number,
  thicknessPx: number,
  { cellSize, offset }: OpeningRectOptions
): OpeningRect | null {
  const x1 = wall.x1 * cellSize + offset.x;
  const y1 = wall.y1 * cellSize + offset.y;
  const x2 = wall.x2 * cellSize + offset.x;
  const y2 = wall.y2 * cellSize + offset.y;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length === 0) return null;

  const segments = Math.max(1, segEnd - segStart);
  const segLength = length / segments;

  const startT = segStart / segments;
  const endT = segEnd / segments;

  const sx = x1 + startT * dx;
  const sy = y1 + startT * dy;
  const ex = x1 + endT * dx;
  const ey = y1 + endT * dy;

  const cx = (sx + ex) / 2;
  const cy = (sy + ey) / 2;

  const width = segLength * Math.abs(segEnd - segStart);
  const height = thicknessPx;

  return {
    cx: cx - width / 2,
    cy: cy - height / 2,
    width,
    height,
  };
}

