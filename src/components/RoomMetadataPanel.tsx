// src/components/RoomMetadataPanel.tsx
import React from "react";
import type { Room, RoomCategory } from "../types";
import {
  inferRoomCategory,
  ensureRoomMetadata,
} from "../utils/roomMetadata";

export function RoomMetadataPanel({ room, onChange }: RoomMetadataPanelProps) {
  if (!room) {
    return (
      <div className="room-metadata-panel empty">
        No room selected.
      </div>
    );
  }
  const cellCount =
    room.cellKeys?.length ?? room.width * room.height;
  const suggestedCategory = inferRoomCategory(cellCount);

  function update(
    partial: Partial<Omit<Room, "id" | "x" | "y" | "width" | "height">>
  ) {
    const merged: Room = {
      ...room,
      ...partial,
      id: room.id,
      x: room.x,
      y: room.y,
      width: room.width,
      height: room.height,
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
          value={room.name ?? ""}
          onChange={e => update({ name: e.target.value })}
        />
      </div>

      <div className="field">
        <div className="field-label">Color</div>
        <input
          type="color"
          className="color-input"
          value={room.color ?? "#c2e7ff"}
          onChange={e => update({ color: e.target.value })}
        />
      </div>

      <div className="field">
        <div className="field-label">Category</div>
        <select
          className="select-input"
          value={room.category ?? suggestedCategory}
          onChange={e =>
            update({ category: e.target.value as RoomCategory })
          }
        >
          {CATEGORIES.map(cat => (
            <option key={cat} value={cat}>
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div className="room-size-info">
        <div>Cells: {cellCount}</div>
        <div>Suggested: {suggestedCategory}</div>
        {room.category && room.category !== suggestedCategory && (
          <div className="warning">
            Size suggests <strong>{suggestedCategory}</strong>, but
            category is set to <strong>{room.category}</strong>.
          </div>
        )}
      </div>
    </div>
  );
};

