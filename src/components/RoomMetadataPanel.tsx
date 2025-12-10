// src/components/RoomMetadataPanel.tsx
import type { Room, RoomCategory } from "../types";
import {
  inferRoomCategory,
  ensureRoomMetadata,
} from "../utils/roomMetadata";

type RoomMetadataPanelProps = {
  room: Room | null;
  onChange(updated: Room): void;
};

// Simple list of category options to show in the dropdown.
// We treat them as plain strings for the UI and cast to RoomCategory on change.
const CATEGORIES: string[] = ["summary", "function", "notes"];

export function RoomMetadataPanel({ room, onChange }: RoomMetadataPanelProps) {
  // No room selected state
  if (!room) {
    return (
      <div className="room-metadata-panel empty">
        No room selected.
      </div>
    );
  }

  // From here on, room is non-null
  const safeRoom: Room = room;

  const cellCount =
    safeRoom.cellKeys?.length ?? safeRoom.width * safeRoom.height;
  const suggestedCategory = inferRoomCategory(cellCount);

  function update(
    partial: Partial<Omit<Room, "id" | "x" | "y" | "width" | "height">>
  ) {
    const merged: Room = {
      ...safeRoom,
      ...partial,
      // Ensure required fields are never overwritten by undefined
      id: safeRoom.id,
      x: safeRoom.x,
      y: safeRoom.y,
      width: safeRoom.width,
      height: safeRoom.height,
    };

    onChange(ensureRoomMetadata(merged));
  }

  return (
    <div className="room-metadata-panel">
      <h3>Room</h3>

      <div className="field">
        <div className="field-label">Name</div>
        <input
          type="text"
          className="text-input"
          value={safeRoom.name ?? ""}
          onChange={(e) => update({ name: e.target.value })}
        />
      </div>

      <div className="field">
        <div className="field-label">Color</div>
        <input
          type="color"
          className="color-input"
          value={safeRoom.color ?? "#c2e7ff"}
          onChange={(e) => update({ color: e.target.value })}
        />
      </div>

      <div className="field">
        <div className="field-label">Category</div>
        <select
          className="select-input"
          value={safeRoom.category ?? suggestedCategory ?? ""}
          onChange={(e) =>
            update({ category: e.target.value as RoomCategory })
          }
        >
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div className="room-size-info">
        <div>Cells: {cellCount}</div>
        <div>Suggested: {suggestedCategory}</div>
        {safeRoom.category &&
          suggestedCategory &&
          safeRoom.category !== suggestedCategory && (
            <div className="warning">
              Size suggests <strong>{suggestedCategory}</strong>, but
              category is set to <strong>{safeRoom.category}</strong>.
            </div>
          )}
      </div>
    </div>
  );
}

