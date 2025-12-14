// src/components/ToolPalette.tsx
import React from "react";
import { Tool } from "../types";

interface Props {
  currentTool: Tool;
  setCurrentTool: (tool: Tool) => void;
}

const tools: { tool: Tool; label: string }[] = [
  { tool: Tool.Room, label: "Room" },
  { tool: Tool.Wall, label: "Wall" },
  { tool: Tool.Door, label: "Door" },
  { tool: Tool.Window, label: "Window" },
  { tool: Tool.Erase, label: "Erase" },
  { tool: Tool.Pan, label: "Pan" },

  // NEW:
  { tool: Tool.Stair, label: "Stair" },
];

export const ToolPalette: React.FC<Props> = ({
  currentTool,
  setCurrentTool,
}) => {
  return (
    <div className="tool-palette">
      <div className="tool-buttons">
        {tools.map(t => (
          <button
            key={t.tool}
            className={
              "tool-button" +
              (currentTool === t.tool ? " active" : "")
            }
            onClick={() => setCurrentTool(t.tool)}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
};

