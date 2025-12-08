// src/utils/rooms.ts
import type { Room, Wall } from "../types/bastion";

/**
 * Build a single rectangular Room from the selected cell keys.
 * This matches the original confirmRoom logic (bounding box).
 */
export function createRoomFromCellKeys(cellKeys: string[]): Room | null {
  if (!cellKeys.length) return null;

  const xs = cellKeys.map((k) => Number(k.split(",")[0]));
  const ys = cellKeys.map((k) => Number(k.split(",")[1]));

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    id: crypto.randomUUID(),
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

/**
 * Axis-aligned AABB overlap test between an existing room set and a candidate.
 * Extracted from original isRoomOverlap helper.
 */
export function hasRoomOverlap(rooms: Room[], candidate: Room): boolean {
  const minX = candidate.x;
  const minY = candidate.y;
  const maxX = candidate.x + candidate.width;
  const maxY = candidate.y + candidate.height;

  return rooms.some((r) => {
    const rMinX = r.x;
    const rMinY = r.y;
    const rMaxX = r.x + r.width;
    const rMaxY = r.y + r.height;
    return minX < rMaxX && maxX > rMinX && minY < rMaxY && maxY > rMinY;
  });
}

/**
 * Create the four perimeter walls around a room.
 * Direct extraction of the original confirmRoom → top/bottom/left/right walls.
 */
export function perimeterWallsForRoom(room: Room): Wall[] {
  const { x, y, width, height } = room;

  const top: Wall = {
    id: crypto.randomUUID(),
    x1: x,
    y1: y,
    x2: x + width,
    y2: y,
  };
  const bottom: Wall = {
    id: crypto.randomUUID(),
    x1: x,
    y1: y + height,
    x2: x + width,
    y2: y + height,
  };
  const left: Wall = {
    id: crypto.randomUUID(),
    x1: x,
    y1: y,
    x2: x,
    y2: y + height,
  };
  const right: Wall = {
    id: crypto.randomUUID(),
    x1: x + width,
    y1: y,
    x2: x + width,
    y2: y + height,
  };

  return [top, bottom, left, right];
}

