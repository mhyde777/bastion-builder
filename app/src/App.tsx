// src/App.tsx
import React, { useState } from "react";
import Home from "./components/Home";
import ProjectView from "./components/ProjectView";
import type { Project, Level, FloorGeometry } from "./types/bastion";
import "./App.css";

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

const createInitialLevel = (name: string, elevation: number): Level => ({
  id: makeId(),
  name,
  elevation,
  geometry: createEmptyGeometry(),
});

const createProject = (name: string): Project => ({
  id: makeId(),
  name,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  levels: [createInitialLevel("Level 1", 1)],
});

const App: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([
    createProject("Sample Keep Layout"),
  ]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(
    projects[0]?.id ?? null
  );

  const handleOpenProject = (id: string) => {
    setActiveProjectId(id);
  };

  const handleCreateProject = () => {
    const name = window.prompt("Project name:", "New Bastion");
    if (!name) return;
    const newProject = createProject(name);
    setProjects((prev) => [...prev, newProject]);
    setActiveProjectId(newProject.id);
  };

  const handleProjectChange = (updated: Project) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === updated.id ? updated : p))
    );
  };

  const handleBackToHome = () => {
    setActiveProjectId(null);
  };

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;

  return (
    <div className="app-root">
      {activeProject ? (
        <ProjectView
          project={activeProject}
          onProjectChange={handleProjectChange}
          onBackToHome={handleBackToHome}
        />
      ) : (
        <Home
          projects={projects}
          onOpenProject={handleOpenProject}
          onCreateProject={handleCreateProject}
        />
      )}
    </div>
  );
};

export default App;

