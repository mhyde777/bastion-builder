// src/components/Home.tsx
import React from "react";
import type { Project } from "../types/bastion";

interface HomeProps {
  projects: Project[];
  onOpenProject: (id: string) => void;
  onCreateProject: () => void;
}

const Home: React.FC<HomeProps> = ({
  projects,
  onOpenProject,
  onCreateProject,
}) => {
  return (
    <div className="home-root">
      <header className="home-header">
        <h1>Bastion Builder</h1>
        <button className="home-new-btn" onClick={onCreateProject}>
          New Project
        </button>
      </header>

      <section className="home-projects">
        {projects.length === 0 ? (
          <p>No projects yet. Create one to get started.</p>
        ) : (
          <ul className="home-project-list">
            {projects.map((p) => (
              <li key={p.id} className="home-project-item">
                <div className="home-project-main">
                  <div className="home-project-name">{p.name}</div>
                  <div className="home-project-meta">
                    Levels: {p.levels.length || 0}
                  </div>
                </div>
                <button onClick={() => onOpenProject(p.id)}>Open</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default Home;

