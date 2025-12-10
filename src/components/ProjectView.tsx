// src/components/ProjectView.tsx
import React, {
  useEffect,
  useMemo,
  useState,
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import type {
  CameraState,
  FloorGeometry,
  Level,
  Project,
} from "../types";
import { Tool } from "../types";
import { ProjectHeader } from "./ProjectHeader";
import { LevelPicker } from "./LevelPicker";
import { ToolPalette } from "./ToolPalette";
import { Canvas } from "./Canvas";

function createEmptyGeometry(): FloorGeometry {
  return { rooms: [], walls: [], doors: [], windows: [] };
}

function createFallbackProject(id: string): Project {
  const level1: Level = {
    id: "level-1",
    name: "Floor 1",
    elevation: 0,
    geometry: createEmptyGeometry(),
  };
  const level0: Level = {
    id: "level-0",
    name: "Basement",
    elevation: -1,
    geometry: createEmptyGeometry(),
  };

  return {
    id,
    name: "Untitled",
    levels: [level0, level1],
    version: 1,
  };
}

export const ProjectView: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(
    null
  );
  const [currentLevelId, setCurrentLevelId] = useState<
    string | null
  >(null);

  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(
    null
  );

  const [currentTool, setCurrentTool] = useState<Tool>(
    Tool.Room
  );

  const [camera, setCamera] = useState<CameraState>({
    offset: { x: 300, y: 200 },
    zoom: 1,
  });

  // 1) Load project by id
  useEffect(() => {
    if (!projectId) {
      navigate("/");
      return;
    }

    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(
          `/api/projects/${projectId}`
        );
        if (!res.ok) {
          throw new Error("Failed to load project");
        }
        const data = (await res.json()) as Project;
        if (!cancelled) {
          setProject(data);
          const firstLevelId =
            data.levels[0]?.id ?? null;
          setCurrentLevelId(firstLevelId);
        }
      } catch {
        if (!cancelled) {
          const fallback =
            createFallbackProject(projectId);
          setProject(fallback);
          const firstLevelId =
            fallback.levels[0]?.id ?? null;
          setCurrentLevelId(firstLevelId);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [projectId, navigate]);

  const currentLevel = useMemo(() => {
    if (!project) return null;
    if (!currentLevelId) {
      return project.levels[0] ?? null;
    }
    return (
      project.levels.find(
        l => l.id === currentLevelId
      ) ?? project.levels[0] ?? null
    );
  }, [project, currentLevelId]);

  const underlayLevel = useMemo(() => {
    if (!project || !currentLevel) return null;
    const sameElevation = project.levels
      .filter(
        l => l.elevation < currentLevel.elevation
      )
      .sort((a, b) => b.elevation - a.elevation);
    return sameElevation[0] ?? null;
  }, [project, currentLevel]);

  async function saveProject(next: Project) {
    if (!projectId) return;
    try {
      setSaveError(null);
      const res = await fetch(
        `/api/projects/${projectId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(next),
        }
      );

      if (res.status === 409) {
        const serverProject =
          (await res.json()) as Project;
        setProject(serverProject);
        setCurrentLevelId(prevId => {
          if (
            prevId &&
            serverProject.levels.some(
              l => l.id === prevId
            )
          ) {
            return prevId;
          }
          return serverProject.levels[0]?.id ?? null;
        });
        return;
      }

      if (!res.ok) {
        throw new Error("Save failed");
      }

      const updated = (await res.json()) as Project;
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

  // WebSocket: live updates for this project only
  useEffect(() => {
    if (!projectId) return;

    const proto =
      location.protocol === "https:"
        ? "wss"
        : "ws";
    const ws = new WebSocket(
      `${proto}://${location.host}/ws/projects?id=${projectId}`
    );

    ws.onmessage = event => {
      try {
        const incoming = JSON.parse(
          event.data
        ) as Project;
        setProject(prev => {
          if (!prev) return incoming;
          if (incoming.version > prev.version) {
            return incoming;
          }
          return prev;
        });
        setCurrentLevelId(prevId => {
          if (
            prevId &&
            incoming.levels.some(l => l.id === prevId)
          ) {
            return prevId;
          }
          return incoming.levels[0]?.id ?? null;
        });
      } catch {
        // ignore malformed messages
      }
    };

    return () => {
      ws.close();
    };
  }, [projectId]);

  function updateProjectLevelGeometry(
    levelId: string,
    newGeometry: FloorGeometry
  ) {
    if (!project) return;

    const levels = project.levels.map(l =>
      l.id === levelId ? { ...l, geometry: newGeometry } : l
    );
    const next: Project = { ...project, levels };

    setProject(next);
    void saveProject(next);
  }

  function handleCommitGeometry(newGeom: FloorGeometry) {
    if (!currentLevel) return;
    updateProjectLevelGeometry(
      currentLevel.id,
      newGeom
    );
  }

  function handleChangeLevel(id: string) {
    setCurrentLevelId(id);
  }

  function handleBackToHome() {
    navigate("/");
  }

  if (loading || !project || !currentLevel) {
    return <div className="app-root">Loading…</div>;
  }

  return (
    <div className="app-root">
      <aside className="sidebar">
        <button
          className="back-button"
          onClick={handleBackToHome}
        >
          ← Back to Home
        </button>
        <ProjectHeader
          name={project.name}
          elevation={currentLevel.elevation}
        />
        <LevelPicker
          levels={project.levels}
          currentLevelId={currentLevel.id}
          onChangeLevel={handleChangeLevel}
        />
        <ToolPalette
          currentTool={currentTool}
          setCurrentTool={setCurrentTool}
        />
        {saveError && (
          <div className="save-error">
            {saveError}
          </div>
        )}
        <div className="save-status">
          Version: {project.version}
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
        />
      </main>
    </div>
  );
};

