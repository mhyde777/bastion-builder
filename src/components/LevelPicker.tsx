// src/components/LevelPicker.tsx
import React from "react";
import type { Level } from "../types";

interface Props {
  levels: Level[];
  currentLevelId: string;
  onChangeLevel: (id: string) => void;
}

export const LevelPicker: React.FC<Props> = ({
  levels,
  currentLevelId,
  onChangeLevel,
}) => {
  return (
    <div className="level-picker">
      <label>Level</label>
      <select
        value={currentLevelId}
        onChange={e => onChangeLevel(e.target.value)}
      >
        {levels
          .sort((a, b) => a.elevation - b.elevation)
          .map(l => (
            <option key={l.id} value={l.id}>
              {l.name} ({l.elevation})
            </option>
          ))}
      </select>
    </div>
  );
};

