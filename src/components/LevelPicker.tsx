// src/components/LevelPicker.tsx
import React from "react";
import type { Level } from "../types";

interface Props {
  levels: Level[];
  currentLevelId: string | null;
  onChangeLevel: (id: string) => void;
  onAddLevelAbove: (id: string) => void;
  onAddLevelBelow: (id: string) => void;
  onDeleteLevel: (id: string) => void;
}

export const LevelPicker: React.FC<Props> = ({
  levels,
  currentLevelId,
  onChangeLevel,
  onAddLevelAbove,
  onAddLevelBelow,
  onDeleteLevel,
}) => {
  const sortedLevels = [...levels].sort(
    (a, b) => a.elevation - b.elevation
  );

  const current = currentLevelId
    ? sortedLevels.find(l => l.id === currentLevelId) ?? null
    : null;

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
        <button
          type="button"
          disabled={!current}
          onClick={() => current && onAddLevelBelow(current.id)}
        >
          + Below
        </button>
        <button
          type="button"
          disabled={!current}
          onClick={() => current && onAddLevelAbove(current.id)}
        >
          + Above
        </button>
        <button
          type="button"
          disabled={!current || levels.length <= 1}
          onClick={() => current && onDeleteLevel(current.id)}
        >
          Delete
        </button>
      </div>
    </div>
  );
};

