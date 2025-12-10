// src/utils/roomMetadata.ts
import type { Room, RoomCategory } from "../types";

// Helper to count cells for a room
export function getRoomCellCount(room: Room): number {
  if (room.cellKeys && room.cellKeys.length > 0) {
    return room.cellKeys.length;
  }
  return room.width * room.height;
}

/**
 * Infer a category from a cell count.
 *
 * Current bands:
 * - cramped: 1–8 cells   (tiny closets, nooks)
 * - roomy:   9–24 cells  (typical chambers)
 * - vast:    25+ cells   (great halls, large spaces)
 *
 * This makes a 6×6 (36 cells) room "vast".
 */
export function inferRoomCategory(cellCount: number): RoomCategory {
  if (cellCount <= 4) {
    return "cramped";
  }
  if (cellCount <= 16) {
    return "roomy";
  }
  return "vast";
}

// Optional: default colors per category
function defaultColorForCategory(cat: RoomCategory): string {
  switch (cat) {
    case "cramped":
      return "#f4d3d3"; // small, warm
    case "roomy":
      return "#c2e7ff"; // medium, neutral
    case "vast":
      return "#d8f5d0"; // large, airy
    default:
      return "#c2e7ff";
  }
}

/**
 * Ensure a room has consistent metadata:
 * - name defaults to empty string (you can override in UI)
 * - color defaults based on inferred category if missing
 * - category defaults from size if missing
 */
export function ensureRoomMetadata(room: Room): Room {
  const cellCount = getRoomCellCount(room);
  const suggestedCategory = inferRoomCategory(cellCount);

  const category: RoomCategory =
    room.category ?? suggestedCategory;

  const color =
    room.color ?? defaultColorForCategory(category);

  return {
    ...room,
    name: room.name ?? "",
    category,
    color,
  };
}

