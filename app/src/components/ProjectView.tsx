// src/components/ProjectView.tsx
import React, { useMemo, useState, useCallback } from "react";
import Canvas from "./Canvas";
import type { Project, Tool, Level, FloorGeometry } from "../types/bastion";

interface ProjectViewProps {
  project: Project;
  onProjectChange: (project: Project) => void;
  onBackToHome: () => void;
}

const makeId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const createEmptyGeometry = (): FloorGeometry => ({
  rooms: [],
  walls: [],
  doors: [],
  windows: [],
});

const createLevel = (name: string, elevation: number): Level => ({
  id: makeId(),
  name,
  elevation,
  geometry: createEmptyGeometry(),
});

const ProjectView: React.FC<ProjectViewProps> = ({
  project,
  onProjectChange,
  onBackToHome,
}) => {
  const [tool, setTool] = useState<Tool>("room");

  const sortedLevels = useMemo(
    () => [...project.levels].sort((a, b) => a.elevation - b.elevation),
    [project.levels]
  );

  const [currentLevelIndex, setCurrentLevelIndex] = useState(0);

  const currentLevel: Level | null =
    sortedLevels[currentLevelIndex] ?? sortedLevels[0] ?? null;

  const underlayLevel: Level | null =
    currentLevelIndex > 0 ? sortedLevels[currentLevelIndex - 1] : null;

  const handleToolClick = (next: Tool) => setTool(next);

  const saveLevels = (newLevels: Level[], keepIndex?: number) => {
    const updated: Project = {
      ...project,
      levels: newLevels,
      updatedAt: Date.now(),
    };
    onProjectChange(updated);

    if (typeof keepIndex === "number") {
      setCurrentLevelIndex(keepIndex);
    } else if (currentLevel) {
      const idx = newLevels
        .slice()
        .sort((a, b) => a.elevation - b.elevation)
        .findIndex((lvl) => lvl.id === currentLevel.id);
      setCurrentLevelIndex(idx === -1 ? 0 : idx);
    }
  };

  const handleLevelUp = () => {
    if (!sortedLevels.length) {
      const base = createLevel("Level 1", 1);
      saveLevels([base], 0);
      return;
    }

    if (!currentLevel) return;

    if (currentLevelIndex === sortedLevels.length - 1) {
      const maxElevation = sortedLevels[sortedLevels.length - 1].elevation;
      const newElevation = maxElevation >= 1 ? maxElevation + 1 : 1;
      const newLevel = createLevel(`Level ${newElevation}`, newElevation);

      const newLevels = [...project.levels, newLevel];
      const newSorted = newLevels
        .slice()
        .sort((a, b) => a.elevation - b.elevation);
      const newIndex = newSorted.findIndex((lvl) => lvl.id === newLevel.id);

      saveLevels(newLevels, newIndex);
    } else {
      setCurrentLevelIndex((idx) => Math.min(idx + 1, sortedLevels.length - 1));
    }
  };

  const handleLevelDown = () => {
    if (!sortedLevels.length) {
      const base = createLevel("Basement 1", -1);
      saveLevels([base], 0);
      return;
    }

    if (!currentLevel) return;

    if (currentLevelIndex === 0) {
      const minElevation = sortedLevels[0].elevation;
      const newElevation = minElevation <= -1 ? minElevation - 1 : -1;
      const newLevel = createLevel(
        newElevation < 0
          ? `Basement ${Math.abs(newElevation)}`
          : `Level ${newElevation}`,
        newElevation
      );

      const newLevels = [...project.levels, newLevel];
      const newSorted = newLevels
        .slice()
        .sort((a, b) => a.elevation - b.elevation);
      const newIndex = newSorted.findIndex((lvl) => lvl.id === newLevel.id);

      saveLevels(newLevels, newIndex);
    } else {
      setCurrentLevelIndex((idx) => Math.max(idx - 1, 0));
    }
  };

  const levelLabel = currentLevel
    ? currentLevel.elevation === 0
      ? currentLevel.name
      : currentLevel.elevation > 0
      ? `Floor ${currentLevel.elevation}`
      : `Basement ${Math.abs(currentLevel.elevation)}`
    : "No Level";

  const handleGeometryChange = useCallback(
    (geometry: FloorGeometry) => {
      if (!currentLevel) return;

      const newLevels = project.levels.map((lvl) =>
        lvl.id === currentLevel.id ? { ...lvl, geometry } : lvl
      );

      onProjectChange({
        ...project,
        levels: newLevels,
        updatedAt: Date.now(),
      });
    },
    [project, currentLevel, onProjectChange]
  );

  return (
    <div className="project-root">
      <header className="project-header">
        <button className="project-back-btn" onClick={onBackToHome}>
          ← Projects
        </button>
        <h2>{project.name}</h2>
        <div className="project-level-info">
          <div className="level-controls">
            <button
              type="button"
              className="level-btn"
              onClick={handleLevelDown}
              title="Lower level / add basement"
            >
              ▼
            </button>
            <span className="level-label">{levelLabel}</span>
            <button
              type="button"
              className="level-btn"
              onClick={handleLevelUp}
              title="Upper level / add floor"
            >
              ▲
            </button>
          </div>
        </div>
      </header>

      <div className="project-body">
        <aside className="project-toolbar">
          <div className="toolbar-group">
            <div className="toolbar-title">Tools</div>

            <button
              className={`tool-btn ${tool === "room" ? "active" : ""}`}
              onClick={() => handleToolClick("room")}
            >
              Room
            </button>
            <button
              className={`tool-btn ${tool === "wall" ? "active" : ""}`}
              onClick={() => handleToolClick("wall")}
            >
              Wall
            </button>
            <button
              className={`tool-btn ${tool === "door" ? "active" : ""}`}
              onClick={() => handleToolClick("door")}
            >
              Door
            </button>
            <button
              className={`tool-btn ${tool === "window" ? "active" : ""}`}
              onClick={() => handleToolClick("window")}
            >
              Window
            </button>
            <button
              className={`tool-btn ${tool === "erase" ? "active" : ""}`}
              onClick={() => handleToolClick("erase")}
            >
              Erase
            </button>
            <button
              className={`tool-btn ${tool === "pan" ? "active" : ""}`}
              onClick={() => handleToolClick("pan")}
            >
              Pan
            </button>
          </div>
        </aside>

        <main className="project-canvas-wrapper">
          {currentLevel && (
            <Canvas
              key={currentLevel.id}
              tool={tool}
              geometry={currentLevel.geometry}
              underlayGeometry={underlayLevel?.geometry ?? null}
              onGeometryChange={handleGeometryChange}
            />
          )}
        </main>
      </div>
    </div>
  );
};

export default ProjectView;

