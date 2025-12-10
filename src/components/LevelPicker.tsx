// src/components/LevelPicker.tsx
import React from "react";
import type { Level } from "../types";

interface Props {
  levels: Level[];
  currentLevelId: string | null;
  onChangeLevel: (id: string) => void;
  onAddLevel: () => void;
  onDeleteLevel: (id: string) => void;
}

export const LevelPicker: React.FC<Props> = ({
  levels,
  currentLevelId,
  onChangeLevel,
  onAddLevel,
  onDeleteLevel,
}) => {
  const sortedLevels = [...levels].sort(
    (a, b) => a.elevation - b.elevation
  );

  return (
    <div className="level-picker">
      <label>
        Level{" "}
        <select
          value={currentLevelId ?? ""}
          onChange={e => onChangeLevel(e.target.value)}
        >
          {sortedLevels.map(level => (
            <option key={level.id} value={level.id}>
              {level.name} ({level.elevation})
            </option>
          ))}
        </select>
      </label>

      <div className="level-picker-buttons">
        <button type="button" onClick={onAddLevel}>
          + Level
        </button>
        <button
          type="button"
          onClick={() =>
            currentLevelId && onDeleteLevel(currentLevelId)
          }
          disabled={!currentLevelId || levels.length <= 1}
        >
          Delete
        </button>
      </div>
    </div>
  );
};

