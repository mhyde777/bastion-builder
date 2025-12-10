// src/components/HomeScreen.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../theme";

interface ProjectSummary {
  id: string;
  name: string;
  version: number;
}

// Local Theme type (do not import Theme from ../theme to avoid runtime issues)
type Theme = "light" | "dark" | "blueprint";

export const HomeScreen: React.FC = () => {
  const [projects, setProjects] = useState<
    ProjectSummary[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [deletingId, setDeletingId] = useState<
    string | null
  >(null);

  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/projects");
        if (!res.ok) throw new Error("Failed to load");
        const data =
          (await res.json()) as ProjectSummary[];
        if (!cancelled) {
          setProjects(data);
        }
      } catch {
        if (!cancelled) setError("Failed to load projects");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreateProject() {
    try {
      setCreating(true);
      setError(null);
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newName || "New Project",
        }),
      });
      if (!res.ok) throw new Error("Create failed");
      const project = await res.json();
      navigate(`/project/${project.id}`);
    } catch {
      setError("Failed to create project");
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteProject(id: string) {
    const confirmDelete = window.confirm(
      "Delete this project? This cannot be undone."
    );
    if (!confirmDelete) return;

    try {
      setDeletingId(id);
      setError(null);
      const res = await fetch(`/api/projects/${id}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) {
        throw new Error("Delete failed");
      }
      setProjects(prev =>
        prev.filter(p => p.id !== id)
      );
    } catch {
      setError("Failed to delete project");
    } finally {
      setDeletingId(null);
    }
  }

  function handleThemeChange(
    e: React.ChangeEvent<HTMLSelectElement>
  ) {
    setTheme(e.target.value as Theme);
  }

  if (loading) {
    return <div className="home-root">Loading…</div>;
  }

  return (
    <div className="home-root">
      <header className="home-header">
        <h1>Bastion Builder</h1>
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
      </header>

      {error && (
        <div className="error-banner">{error}</div>
      )}

      <section>
        <h2>Projects</h2>
        {projects.length === 0 ? (
          <p>No projects yet.</p>
        ) : (
          <ul className="project-list">
            {projects.map(p => (
              <li
                key={p.id}
                className="project-list-item"
              >
                <button
                  className="project-open-button"
                  onClick={() =>
                    navigate(`/project/${p.id}`)
                  }
                >
                  {p.name}{" "}
                  <span className="muted">
                  </span>
                </button>
                <button
                  className="project-delete-button"
                  onClick={() =>
                    handleDeleteProject(p.id)
                  }
                  disabled={deletingId === p.id}
                >
                  {deletingId === p.id
                    ? "Deleting…"
                    : "Delete"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="new-project">
        <h2>New project</h2>
        <input
          type="text"
          placeholder="Project name"
          value={newName}
          onChange={e => setNewName(e.target.value)}
        />
        <button
          onClick={handleCreateProject}
          disabled={creating}
        >
          {creating ? "Creating…" : "Create"}
        </button>
      </section>
    </div>
  );
};

