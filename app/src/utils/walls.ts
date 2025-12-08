// src/utils/walls.ts
import type { Wall } from "../types/bastion";

/**
 * Normalize a wall so that it always goes from the "smaller" end to the "larger".
 * This is exactly the inline normalizeWall from the original Canvas.tsx.
 */
export const normalizeWall = (wall: Wall): Wall => {
  if (wall.x1 === wall.x2 && wall.y1 === wall.y2) {
    return wall;
  }
  if (wall.x1 < wall.x2 || wall.y1 < wall.y2) {
    return wall;
  }
  return {
    ...wall,
    x1: wall.x2,
    y1: wall.y2,
    x2: wall.x1,
    y2: wall.y1,
  };
};

/**
 * Optional: merge collinear walls (used when placing room perimeter walls).
 * This is a direct extraction of mergeWalls from the original Canvas.tsx.
 */
export const mergeWalls = (inputWalls: Wall[]): Wall[] => {
  const horizontals = inputWalls.filter((w) => w.y1 === w.y2);
  const verticals = inputWalls.filter((w) => w.x1 === w.x2);
  const others = inputWalls.filter((w) => w.x1 !== w.x2 && w.y1 !== w.y2);

  const mergeCollinear = (segments: Wall[], horizontal: boolean): Wall[] => {
    const sorted = segments
      .map(normalizeWall)
      .sort((a, b) => {
        const keyA = horizontal ? a.y1 : a.x1;
        const keyB = horizontal ? b.y1 : b.x1;
        if (keyA !== keyB) return keyA - keyB;
        const startA = horizontal ? a.x1 : a.y1;
        const startB = horizontal ? b.x1 : b.y1;
        return startA - startB;
      });

    const merged: Wall[] = [];

    for (const seg of sorted) {
      if (!merged.length) {
        merged.push(seg);
        continue;
      }
      const last = merged[merged.length - 1];

      if (horizontal) {
        if (seg.y1 === last.y1 && seg.x1 <= last.x2) {
          last.x2 = Math.max(last.x2, seg.x2);
        } else {
          merged.push(seg);
        }
      } else {
        if (seg.x1 === last.x1 && seg.y1 <= last.y2) {
          last.y2 = Math.max(last.y2, seg.y2);
        } else {
          merged.push(seg);
        }
      }
    }

    return merged;
  };

  const mergedHoriz = mergeCollinear(horizontals, true);
  const mergedVert = mergeCollinear(verticals, false);
  const merged = [...mergedHoriz, ...mergedVert, ...others];

  const usedIds = new Set(merged.map((w) => w.id));
  const result = merged.map((w) => {
    if (!w.id || usedIds.has(w.id)) {
      return { ...w, id: crypto.randomUUID() };
    }
    return w;
  });

  return result;
};

