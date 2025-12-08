// src/utils/erase.ts
import type { Room, Wall } from "../types/bastion";
import type { Point } from "./selection";

export function findRoomAtGrid(rooms: Room[], grid: Point): Room | null {
  return (
    rooms.find(
      (r) =>
        grid.x >= r.x &&
        grid.x < r.x + r.width &&
        grid.y >= r.y &&
        grid.y < r.y + r.height
    ) ?? null
  );
}

/**
 * Given a room and all walls, find walls that lie along the room's perimeter.
 * This is extracted from the original eraseAtPoint logic.
 */
export function findWallsAroundRoom(
  room: Room,
  walls: Wall[]
): { wallIdsToErase: Set<string> } {
  const rx1 = room.x;
  const ry1 = room.y;
  const rx2 = room.x + room.width;
  const ry2 = room.y + room.height;

  const aroundWalls = walls.filter((w) => {
    const isVertical =
      w.x1 === w.x2 &&
      w.x1 >= rx1 &&
      w.x1 <= rx2 &&
      ((w.y1 >= ry1 && w.y1 <= ry2) ||
        (w.y2 >= ry1 && w.y2 <= ry2));

    const isHorizontal =
      w.y1 === w.y2 &&
      w.y1 >= ry1 &&
      w.y1 <= ry2 &&
      ((w.x1 >= rx1 && w.x1 <= rx2) ||
        (w.x2 >= rx1 && w.x2 <= rx2));

    return isVertical || isHorizontal;
  });

  const wallIdsToErase = new Set(aroundWalls.map((w) => w.id));
  return { wallIdsToErase };
}

