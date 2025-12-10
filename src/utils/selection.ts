// src/utils/selection.ts

export interface GridPoint {
  x: number;
  y: number;
}

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function parseCellKey(key: string): GridPoint {
  const [sx, sy] = key.split(",");
  return { x: parseInt(sx, 10), y: parseInt(sy, 10) };
}

// Inclusive rectangle between two cell positions.
export function rectCellsBetween(
  a: GridPoint,
  b: GridPoint
): string[] {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);

  const keys: string[] = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      keys.push(cellKey(x, y));
    }
  }
  return keys;
}

// XOR a rectangle into a set of selected cell keys
export function xorRectIntoSelection(
  selection: Set<string>,
  rectCells: string[]
): Set<string> {
  const result = new Set(selection);
  for (const key of rectCells) {
    if (result.has(key)) {
      result.delete(key);
    } else {
      result.add(key);
    }
  }
  return result;
}

