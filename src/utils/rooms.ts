// src/utils/rooms.ts
import type { FloorGeometry, Room, Wall } from "../types";
import { parseCellKey } from "./selection";

type IdFactory = () => string;

interface Edge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  orientation: "h" | "v";
}

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function createRoomFromCellKeys(
  cellKeys: Set<string>,
  id: string
): Room | null {
  if (cellKeys.size === 0) return null;

  const coords = Array.from(cellKeys).map(parseCellKey);
  const xs = coords.map(c => c.x);
  const ys = coords.map(c => c.y);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const width = maxX - minX + 1;
  const height = maxY - minY + 1;

  return {
    id,
    x: minX,
    y: minY,
    width,
    height,
    cellKeys: Array.from(cellKeys), // ← important
  };
}

// Axis-aligned rectangle overlap based on room bounds
export function hasRoomOverlap(rooms: Room[], candidate: Room): boolean {
  const leftA = candidate.x;
  const rightA = candidate.x + candidate.width;
  const topA = candidate.y;
  const bottomA = candidate.y + candidate.height;

  return rooms.some(room => {
    const leftB = room.x;
    const rightB = room.x + room.width;
    const topB = room.y;
    const bottomB = room.y + room.height;

    const noOverlap =
      rightA <= leftB ||
      rightB <= leftA ||
      bottomA <= topB ||
      bottomB <= topA;

    return !noOverlap;
  });
}

// Existing rectangular perimeter helper (kept for any other callers)
export function perimeterWallsForRoom(
  room: Room,
  makeId: IdFactory
): Wall[] {
  const { x, y, width, height } = room;

  const left = x;
  const right = x + width;
  const top = y;
  const bottom = y + height;

  const walls: Wall[] = [
    // top
    { id: makeId(), x1: left, y1: top, x2: right, y2: top },
    // bottom
    { id: makeId(), x1: left, y1: bottom, x2: right, y2: bottom },
    // left
    { id: makeId(), x1: left, y1: top, x2: left, y2: bottom },
    // right
    { id: makeId(), x1: right, y1: top, x2: right, y2: bottom },
  ];

  return walls;
}

// --- Irregular room perimeter based on the actual drafted cells ---

function perimeterEdgesFromCellKeys(cellKeys: Set<string>): Edge[] {
  if (cellKeys.size === 0) return [];

  const coords = Array.from(cellKeys).map(parseCellKey);
  const keySet = new Set(cellKeys);
  const edges: Edge[] = [];

  const isSelected = (x: number, y: number) =>
    keySet.has(cellKey(x, y));

  for (const { x, y } of coords) {
    const northY = y - 1;
    const southY = y + 1;
    const westX = x - 1;
    const eastX = x + 1;

    // North edge: horizontal segment at y from x -> x+1
    if (!isSelected(x, northY)) {
      edges.push({
        x1: x,
        y1: y,
        x2: x + 1,
        y2: y,
        orientation: "h",
      });
    }

    // South edge: horizontal segment at y+1
    if (!isSelected(x, southY)) {
      edges.push({
        x1: x,
        y1: y + 1,
        x2: x + 1,
        y2: y + 1,
        orientation: "h",
      });
    }

    // West edge: vertical segment at x
    if (!isSelected(westX, y)) {
      edges.push({
        x1: x,
        y1: y,
        x2: x,
        y2: y + 1,
        orientation: "v",
      });
    }

    // East edge: vertical segment at x+1
    if (!isSelected(eastX, y)) {
      edges.push({
        x1: x + 1,
        y1: y,
        x2: x + 1,
        y2: y + 1,
        orientation: "v",
      });
    }
  }

  return edges;
}

function mergeHorizontal(edges: Edge[]): Edge[] {
  const horizontals = edges.filter(e => e.orientation === "h");
  const byRow = new Map<number, Edge[]>();

  for (const e of horizontals) {
    const row = e.y1; // y1 === y2 for horizontals
    const list = byRow.get(row);
    if (list) {
      list.push(e);
    } else {
      byRow.set(row, [e]);
    }
  }

  const merged: Edge[] = [];

  for (const [y, rowEdges] of byRow) {
    rowEdges.sort((a, b) => a.x1 - b.x1);
    let current = rowEdges[0];

    for (let i = 1; i < rowEdges.length; i++) {
      const next = rowEdges[i];
      if (current.x2 === next.x1) {
        // extend
        current = {
          x1: current.x1,
          y1: y,
          x2: next.x2,
          y2: y,
          orientation: "h",
        };
      } else {
        merged.push(current);
        current = next;
      }
    }

    merged.push(current);
  }

  return merged;
}

function mergeVertical(edges: Edge[]): Edge[] {
  const verticals = edges.filter(e => e.orientation === "v");
  const byCol = new Map<number, Edge[]>();

  for (const e of verticals) {
    const col = e.x1; // x1 === x2 for verticals
    const list = byCol.get(col);
    if (list) {
      list.push(e);
    } else {
      byCol.set(col, [e]);
    }
  }

  const merged: Edge[] = [];

  for (const [x, colEdges] of byCol) {
    colEdges.sort((a, b) => a.y1 - b.y1);
    let current = colEdges[0];

    for (let i = 1; i < colEdges.length; i++) {
      const next = colEdges[i];
      if (current.y2 === next.y1) {
        current = {
          x1: x,
          y1: current.y1,
          x2: x,
          y2: next.y2,
          orientation: "v",
        };
      } else {
        merged.push(current);
        current = next;
      }
    }

    merged.push(current);
  }

  return merged;
}

function mergeEdges(edges: Edge[]): Edge[] {
  return [...mergeHorizontal(edges), ...mergeVertical(edges)];
}

// New helper: build walls from the true drafted shape
export function perimeterWallsFromCellKeys(
  cellKeys: Set<string>,
  makeId: IdFactory
): Wall[] {
  const perimeter = perimeterEdgesFromCellKeys(cellKeys);
  const merged = mergeEdges(perimeter);

  return merged.map(e => ({
    id: makeId(),
    x1: e.x1,
    y1: e.y1,
    x2: e.x2,
    y2: e.y2,
  }));
}

// Convenience clone for history snapshots
export function cloneGeometry(geom: FloorGeometry): FloorGeometry {
  return {
    rooms: geom.rooms.map(r => ({ ...r })),
    walls: geom.walls.map(w => ({ ...w })),
    doors: geom.doors.map(d => ({ ...d })),
    windows: geom.windows.map(w => ({ ...w })),
    staris: geom.stairs ?? [],
  };
}

