// src/utils/selection.ts

export type Point = { x: number; y: number };

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

const keyOf = (p: Point) => `${p.x},${p.y}`;

/**
 * Return all grid cells in an axis-aligned rectangle between a and b (inclusive).
 * Mirrors the original Canvas.tsx preview logic.
 */
export function rectCellsBetween(a: Point, b: Point): Point[] {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);

  const cells: Point[] = [];
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      cells.push({ x, y });
    }
  }
  return cells;
}

/**
 * XOR the rectangle between a and b into the existing selection.
 * This is a direct extraction of the original room-draft XOR logic.
 */
export function xorRectIntoSelection(
  currentKeys: string[],
  a: Point,
  b: Point
): { nextKeys: string[]; bounds: Bounds | null } {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);

  const currentSet = new Set(currentKeys);

  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      const key = `${x},${y}`;
      if (currentSet.has(key)) {
        // overlapping area gets unselected
        currentSet.delete(key);
      } else {
        // new area gets selected
        currentSet.add(key);
      }
    }
  }

  const newKeys = Array.from(currentSet);

  if (newKeys.length === 0) {
    return { nextKeys: [], bounds: null };
  }

  const xs = newKeys.map((k) => Number(k.split(",")[0]));
  const ys = newKeys.map((k) => Number(k.split(",")[1]));
  const bounds: Bounds = {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };

  return { nextKeys: newKeys, bounds };
}

/**
 * Convert "x,y" string keys to Point objects.
 * Mirrors original draftCells mapping in Canvas.tsx.
 */
export function cellKeysToPoints(keys: string[]): Point[] {
  return keys.map((k) => {
    const [xs, ys] = k.split(",");
    return { x: Number(xs), y: Number(ys) };
  });
}

