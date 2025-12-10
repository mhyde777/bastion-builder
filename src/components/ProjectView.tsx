// src/components/ProjectView.tsx
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import type {
  CameraState,
  FloorGeometry,
  Level,
  Project,
  Room,
} from "../types";
import { Tool } from "../types";
import type { Theme } from "../theme";
import { useTheme } from "../theme";

import { ProjectHeader } from "./ProjectHeader";
import { LevelPicker } from "./LevelPicker";
import { ToolPalette } from "./ToolPalette";
import { Canvas } from "./Canvas";
import { RoomMetadataPanel } from "./RoomMetadataPanel";
import { ensureRoomMetadata } from "../utils/roomMetadata";

// helpers ------------------------------------------------------------

function createEmptyGeometry(): FloorGeometry {
  return { rooms: [], walls: [], doors: [], windows: [] };
}

function createFallbackProject(id: string | undefined): Project {
  const safeId = id ?? "local-project";

  const level1: Level = {
    id: "level-1",
    name: "Ground Floor",
    elevation: 0,
    geometry: createEmptyGeometry(),
  };

  const level0: Level = {
    id: "level-0",
    name: "Basement",
    elevation: -10,
    geometry: createEmptyGeometry(),
  };

  return {
    id: safeId,
    name: "Untitled",
    levels: [level0, level1],
    version: 1,
  };
}

function normalizeProject(project: Project): Project {
  return {
    ...project,
    levels: project.levels.map(level => ({
      ...level,
      geometry: {
        ...level.geometry,
        rooms: level.geometry.rooms.map(ensureRoomMetadata),
      },
    })),
  };
}

// component ----------------------------------------------------------

export const ProjectView: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  const [project, setProject] = useState<Project | null>(null);
  const [currentLevelId, setCurrentLevelId] = useState<string | null>(
    null
  );
  const [camera, setCamera] = useState<CameraState>({
    offset: { x: 0, y: 0 },
    zoom: 1,
  });
  const [currentTool, setCurrentTool] = useState<Tool>(Tool.Room);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(
    null
  );

  const wsRef = useRef<WebSocket | null>(null);

  // load project -----------------------------------------------------

  useEffect(() => {
    if (!projectId) {
      navigate("/");
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/projects/${projectId}`);
        if (!res.ok) {
          throw new Error("Failed to load project");
        }
        const raw = (await res.json()) as Project;
        const data = normalizeProject(raw);

        if (!cancelled) {
          setProject(data);
          const firstLevelId = data.levels[0]?.id ?? null;
          setCurrentLevelId(firstLevelId);
          setSelectedRoomId(null);
        }
      } catch {
        if (!cancelled) {
          const fallbackRaw = createFallbackProject(projectId);
          const fallback = normalizeProject(fallbackRaw);
          setProject(fallback);
          const firstLevelId = fallback.levels[0]?.id ?? null;
          setCurrentLevelId(firstLevelId);
          setSelectedRoomId(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [projectId, navigate]);

  // websocket sync ---------------------------------------------------

  useEffect(() => {
    if (!projectId) return;

    const protocol =
      window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${protocol}://${window.location.host}/ws/projects?id=${projectId}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = event => {
      try {
        const incomingRaw = JSON.parse(event.data) as Project;
        const incoming = normalizeProject(incomingRaw);

        setProject(prev => {
          if (!prev || incoming.version >= prev.version) {
            setCurrentLevelId(prevId => {
              if (
                prevId &&
                incoming.levels.some(l => l.id === prevId)
              ) {
                return prevId;
              }
              return incoming.levels[0]?.id ?? null;
            });

            // keep selected room if it still exists on the current level
            setSelectedRoomId(prevSel => {
              if (!prevSel) return null;
              const levelId =
                currentLevelId ?? incoming.levels[0]?.id;
              const current =
                incoming.levels.find(
                  l => l.id === levelId
                ) ?? incoming.levels[0];
              if (!current) return null;
              const exists = current.geometry.rooms.some(
                r => r.id === prevSel
              );
              return exists ? prevSel : null;
            });

            return incoming;
          }
          return prev;
        });
      } catch {
        // ignore invalid messages
      }
    };

    ws.onclose = () => {
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
    };

    return () => {
      ws.close();
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
    };
  }, [projectId, currentLevelId]);

  const currentLevel = useMemo(() => {
    if (!project) return null;
    if (!currentLevelId) {
      return project.levels[0] ?? null;
    }
    return (
      project.levels.find(l => l.id === currentLevelId) ??
      project.levels[0] ??
      null
    );
  }, [project, currentLevelId]);

  const underlayLevel = useMemo(() => {
    if (!project || !currentLevel) return null;
    const lower = project.levels
      .filter(l => l.elevation < currentLevel.elevation)
      .sort((a, b) => b.elevation - a.elevation);
    return lower[0] ?? null;
  }, [project, currentLevel]);

  // keep selectedRoomId valid when level / geometry changes ----------
  useEffect(() => {
    if (!project || !currentLevel) {
      setSelectedRoomId(null);
      return;
    }
    if (!selectedRoomId) return;

    const exists = currentLevel.geometry.rooms.some(
      r => r.id === selectedRoomId
    );
    if (!exists) {
      setSelectedRoomId(null);
    }
  }, [project, currentLevel, selectedRoomId]);

  // saving / updating ------------------------------------------------

  async function saveProject(next: Project) {
    if (!projectId) return;

    try {
      setSaveError(null);
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });

      if (res.status === 409) {
        const serverRaw = (await res.json()) as Project;
        const serverProject = normalizeProject(serverRaw);
        setProject(serverProject);
        setCurrentLevelId(prevId => {
          if (
            prevId &&
            serverProject.levels.some(l => l.id === prevId)
          ) {
            return prevId;
          }
          return serverProject.levels[0]?.id ?? null;
        });
        return;
      }

      if (!res.ok) {
        throw new Error("Failed to save project");
      }

      const updatedRaw = (await res.json()) as Project;
      const updated = normalizeProject(updatedRaw);

      setProject(updated);
      setCurrentLevelId(prevId => {
        if (
          prevId &&
          updated.levels.some(l => l.id === prevId)
        ) {
          return prevId;
        }
        return updated.levels[0]?.id ?? null;
      });
    } catch {
      setSaveError("Save failed");
    }
  }

  function addLevel() {
    if (!project) return;

    const maxElevation =
      project.levels.length > 0
        ? Math.max(...project.levels.map(l => l.elevation))
        : 0;

    const index = project.levels.length + 1;
    const newLevel: Level = {
      id: `level-${Date.now()}`,
      name: `Floor ${index}`,
      elevation: maxElevation + 10,
      geometry: createEmptyGeometry(),
    };

    const levels = [...project.levels, newLevel];
    const next = normalizeProject({ ...project, levels });

    setProject(next);
    setCurrentLevelId(newLevel.id);
    setSelectedRoomId(null);
    void saveProject(next);
  }

  function deleteLevel(levelId: string) {
    if (!project) return;
    if (project.levels.length <= 1) return; // never delete the last level

    const levels = project.levels.filter(l => l.id !== levelId);
    const next = normalizeProject({ ...project, levels });

    setProject(next);
    setSelectedRoomId(null);
    setCurrentLevelId(prevId => {
      if (!prevId || prevId === levelId) {
        return levels[0]?.id ?? null;
      }
      return prevId;
    });
    void saveProject(next);
  }

  function updateProjectLevelGeometry(
    levelId: string,
    newGeometry: FloorGeometry
  ) {
    if (!project) return;

    const levels = project.levels.map(level =>
      level.id === levelId
        ? {
            ...level,
            geometry: {
              ...newGeometry,
              rooms: newGeometry.rooms.map(ensureRoomMetadata),
            },
          }
        : level
    );

    const next = normalizeProject({ ...project, levels });
    setProject(next);
    void saveProject(next);
  }

  function handleCommitGeometry(newGeom: FloorGeometry) {
    if (!currentLevel) return;
    updateProjectLevelGeometry(currentLevel.id, newGeom);
  }

  function handleChangeLevel(id: string) {
    setCurrentLevelId(id);
    setSelectedRoomId(null);
  }

  function handleBackToHome() {
    navigate("/");
  }

  function handleThemeChange(
    e: React.ChangeEvent<HTMLSelectElement>
  ) {
    setTheme(e.target.value as Theme);
  }

  if (loading || !project) {
    return <div className="app-root">Loading…</div>;
  }

  if (!currentLevel) {
    return <div className="app-root">No levels found.</div>;
  }

  const selectedRoom: Room | null =
    currentLevel.geometry.rooms.find(
      r => r.id === selectedRoomId
    ) ?? null;

  function handleRoomMetadataChange(updatedRoom: Room) {
    if (!currentLevel) {
      // Nothing to update if there is no active level
      return;
    }

    const geom = currentLevel.geometry;

    const nextRooms = geom.rooms.map((r) =>
      r.id === updatedRoom.id ? ensureRoomMetadata(updatedRoom) : r
    );

    const newGeometry: FloorGeometry = {
      ...geom,
      rooms: nextRooms,
    };

    updateProjectLevelGeometry(currentLevel.id, newGeometry);
  }

  // theme-driven colors for shell UI --------------------------------

  const appBg =
    theme === "dark"
      ? "#101010"
      : theme === "blueprint"
      ? "#00152e"
      : "#f4f4f8";

  const panelBg =
    theme === "dark"
      ? "#1f1f1f"
      : theme === "blueprint"
      ? "#022143"
      : "#ffffff";

  const textColor =
    theme === "dark"
      ? "#f0f0f0"
      : theme === "blueprint"
      ? "#f5f7ff"
      : "#111111";

  const mutedColor =
    theme === "dark" || theme === "blueprint"
      ? "#9bb3d6"
      : "#666666";

  return (
    <div
      className="app-root"
      style={{ backgroundColor: appBg, color: textColor }}
    >
      <aside
        className="sidebar"
        style={{ backgroundColor: panelBg, color: textColor }}
      >
        <div className="sidebar-header-row">
          <button
            className="back-button"
            onClick={handleBackToHome}
          >
            ← Home
          </button>
          <div className="theme-selector">
            <label>
              Theme:{" "}
              <select
                value={theme}
                onChange={handleThemeChange}
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="blueprint">Blueprint</option>
              </select>
            </label>
          </div>
        </div>

        <ProjectHeader
          name={project.name}
          elevation={currentLevel.elevation}
        />

        <LevelPicker
          levels={project.levels}
          currentLevelId={currentLevel.id}
          onChangeLevel={handleChangeLevel}
          onAddLevel={addLevel}
          onDeleteLevel={deleteLevel}
        />

        <ToolPalette
          currentTool={currentTool}
          setCurrentTool={setCurrentTool}
        />

        <RoomMetadataPanel
          room={selectedRoom}
          onChange={handleRoomMetadataChange}
        />

        {saveError && (
          <div
            className="save-error"
            style={{ color: "#b00020" }}
          >
            {saveError}
          </div>
        )}
        <div
          className="save-status"
          style={{ color: mutedColor }}
        >
        </div>
      </aside>

      <main className="main-area">
        <Canvas
          geometry={currentLevel.geometry}
          underlayGeometry={underlayLevel?.geometry}
          camera={camera}
          setCamera={setCamera}
          currentTool={currentTool}
          onCommitGeometry={handleCommitGeometry}
          onSelectRoom={setSelectedRoomId}
        />
      </main>
    </div>
  );
};

