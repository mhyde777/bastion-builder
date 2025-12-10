// src/utils/erase.ts
import type {
  Door,
  FloorGeometry,
  Room,
  Wall,
  WindowOpening,
} from "../types";

export function findRoomAtGrid(
  x: number,
  y: number,
  rooms: Room[]
): Room | null {
  return (
    rooms.find(
      r =>
        x >= r.x &&
        x < r.x + r.width &&
        y >= r.y &&
        y < r.y + r.height
    ) ?? null
  );
}

export function findWallsAroundRoom(
  room: Room,
  walls: Wall[]
): Wall[] {
  const leftX = room.x;
  const rightX = room.x + room.width;
  const topY = room.y;
  const bottomY = room.y + room.height;

  return walls.filter(w => {
    if (w.y1 === w.y2) {
      // horizontal
      const wy = w.y1;
      const wx1 = Math.min(w.x1, w.x2);
      const wx2 = Math.max(w.x1, w.x2);
      const along =
        wx1 >= leftX && wx2 <= rightX;
      const onEdge = wy === topY || wy === bottomY;
      return along && onEdge;
    } else if (w.x1 === w.x2) {
      // vertical
      const wx = w.x1;
      const wy1 = Math.min(w.y1, w.y2);
      const wy2 = Math.max(w.y1, w.y2);
      const along =
        wy1 >= topY && wy2 <= bottomY;
      const onEdge = wx === leftX || wx === rightX;
      return along && onEdge;
    }
    return false;
  });
}

export function removeWallsAndOpenings(
  wallsToRemove: Wall[],
  geometry: FloorGeometry
): FloorGeometry {
  const idsToRemove = new Set(wallsToRemove.map(w => w.id));

  const walls = geometry.walls.filter(
    w => !idsToRemove.has(w.id)
  );
  const doors = geometry.doors.filter(
    d => !idsToRemove.has(d.wallId)
  );
  const windows = geometry.windows.filter(
    w => !idsToRemove.has(w.wallId)
  );

  return {
    ...geometry,
    walls,
    doors,
    windows,
  };
}

export function removeSingleWallAndOpenings(
  wall: Wall,
  geometry: FloorGeometry
): FloorGeometry {
  return removeWallsAndOpenings([wall], geometry);
}

