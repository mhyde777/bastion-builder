// src/utils/walls.ts
import type { Wall } from "../types";

export function normalizeWall(wall: Wall): Wall {
  if (wall.x1 === wall.x2) {
    // vertical
    if (wall.y2 < wall.y1) {
      return { ...wall, y1: wall.y2, y2: wall.y1 };
    }
    return wall;
  } else if (wall.y1 === wall.y2) {
    // horizontal
    if (wall.x2 < wall.x1) {
      return { ...wall, x1: wall.x2, x2: wall.x1 };
    }
    return wall;
  } else {
    throw new Error("Wall must be orthogonal");
  }
}

// placeholder for future use
export function mergeWalls(walls: Wall[]): Wall[] {
  return walls;
}

