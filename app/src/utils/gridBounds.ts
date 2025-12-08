// src/utils/gridBounds.ts
import type { Room, Wall, FloorGeometry } from "../types/bastion";
import type { Point } from "./selection";

export type GridBounds = {
  minGridX: number;
  maxGridX: number;
  minGridY: number;
  maxGridY: number;
};

type Args = {
  rooms: Room[];
  walls: Wall[];
  draftCells: Point[];
  previewCells: Point[];
  underlayGeometry: FloorGeometry | null;
};

/**
 * Compute rough grid extents from all geometry and draft cells.
 * This is intentionally conservative; Canvas further expands to viewport.
 */
export function computeGridBounds({
  rooms,
  walls,
  draftCells,
  previewCells,
  underlayGeometry,
}: Args): GridBounds {
  let minX = 0;
  let minY = 0;
  let maxX = 10;
  let maxY = 10;

  const includePoint = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };

  rooms.forEach((r) => {
    includePoint(r.x, r.y);
    includePoint(r.x + r.width, r.y + r.height);
  });

  walls.forEach((w) => {
    includePoint(w.x1, w.y1);
    includePoint(w.x2, w.y2);
  });

  draftCells.forEach((c) => {
    includePoint(c.x, c.y);
    includePoint(c.x + 1, c.y + 1);
  });

  previewCells.forEach((c) => {
    includePoint(c.x, c.y);
    includePoint(c.x + 1, c.y + 1);
  });

  if (underlayGeometry) {
    underlayGeometry.rooms?.forEach((r) => {
      includePoint(r.x, r.y);
      includePoint(r.x + r.width, r.y + r.height);
    });
    underlayGeometry.walls?.forEach((w) => {
      includePoint(w.x1, w.y1);
      includePoint(w.x2, w.y2);
    });
  }

  return {
    minGridX: minX,
    maxGridX: maxX,
    minGridY: minY,
    maxGridY: maxY,
  };
}

