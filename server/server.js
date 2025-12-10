// server/server.js
import express from "express";
import bodyParser from "body-parser";
import http from "http";
import { WebSocketServer } from "ws";
import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  unlink,
} from "fs/promises";
import path from "path";

const DATA_ROOT = "./data";
const PROJECTS_DIR = path.join(DATA_ROOT, "projects");

// Helper to create empty geometry
function createEmptyGeometry() {
  return { rooms: [], walls: [], doors: [], windows: [] };
}

// Default project factory
function createDefaultProject(id, name) {
  return {
    id,
    name,
    levels: [
      {
        id: "level-0",
        name: "Basement",
        elevation: -1,
        geometry: createEmptyGeometry(),
      },
      {
        id: "level-1",
        name: "Floor 1",
        elevation: 0,
        geometry: createEmptyGeometry(),
      },
    ],
    version: 1,
  };
}

// In-memory store: Map<projectId, Project>
const projects = new Map();

// --- Persistence helpers ---

function projectFilePath(id) {
  return path.join(PROJECTS_DIR, `${id}.json`);
}

async function loadAllProjects() {
  try {
    await mkdir(PROJECTS_DIR, { recursive: true });
    const files = await readdir(PROJECTS_DIR);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const id = file.replace(/\.json$/, "");
      const raw = await readFile(
        projectFilePath(id),
        "utf8"
      );
      const parsed = JSON.parse(raw);
      if (parsed && parsed.levels) {
        projects.set(id, parsed);
      }
    }
  } catch (err) {
    console.warn("Failed to load projects:", err);
  }

  // If no projects, create a default one
  if (projects.size === 0) {
    const defaultProject = createDefaultProject(
      "project-1",
      "Bastion Alpha"
    );
    projects.set(defaultProject.id, defaultProject);
    await saveProject(defaultProject);
  }
}

async function saveProject(project) {
  await mkdir(PROJECTS_DIR, { recursive: true });
  await writeFile(
    projectFilePath(project.id),
    JSON.stringify(project, null, 2),
    "utf8"
  );
}

// --- WebSocket client tracking ---

// Map<projectId, Set<WebSocket>>
const wsClientsByProjectId = new Map();

function addWsClient(projectId, ws) {
  let set = wsClientsByProjectId.get(projectId);
  if (!set) {
    set = new Set();
    wsClientsByProjectId.set(projectId, set);
  }
  set.add(ws);
}

function removeWsClient(projectId, ws) {
  const set = wsClientsByProjectId.get(projectId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) {
    wsClientsByProjectId.delete(projectId);
  }
}

function broadcastProject(project) {
  const set = wsClientsByProjectId.get(project.id);
  if (!set) return;
  const data = JSON.stringify(project);
  for (const client of set) {
    if (client.readyState === client.OPEN) {
      client.send(data);
    }
  }
}

// --- Express + HTTP server ---

const app = express();
app.use(bodyParser.json());

// List projects (summaries)
app.get("/api/projects", (_req, res) => {
  const list = Array.from(projects.values()).map(p => ({
    id: p.id,
    name: p.name,
    version: p.version,
  }));
  res.json(list);
});

// Create new project
app.post("/api/projects", async (req, res) => {
  const name =
    typeof req.body?.name === "string" &&
    req.body.name.trim().length > 0
      ? req.body.name.trim()
      : "New Project";

  const id = `project-${Date.now()}`;
  const project = createDefaultProject(id, name);
  projects.set(id, project);
  await saveProject(project);
  res.status(201).json(project);
});

// Get single project
app.get("/api/projects/:id", (req, res) => {
  const { id } = req.params;
  const project = projects.get(id);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.json(project);
});

// Update single project with optimistic concurrency
app.put("/api/projects/:id", async (req, res) => {
  const { id } = req.params;
  const current = projects.get(id);
  if (!current) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const incoming = req.body;
  if (typeof incoming.version !== "number") {
    res.status(400).json({ error: "Missing version" });
    return;
  }

  if (incoming.version !== current.version) {
    // Conflict: send back current project
    res.status(409).json(current);
    return;
  }

  const newVersion = current.version + 1;
  const updated = {
    ...incoming,
    id, // enforce consistency
    version: newVersion,
  };
  projects.set(id, updated);
  await saveProject(updated);
  broadcastProject(updated);

  res.json(updated);
});

// Delete a project
app.delete("/api/projects/:id", async (req, res) => {
  const { id } = req.params;
  const current = projects.get(id);
  if (!current) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  // Remove from in-memory store
  projects.delete(id);

  // Close any WebSocket clients for this project
  const set = wsClientsByProjectId.get(id);
  if (set) {
    for (const client of set) {
      try {
        client.close();
      } catch {
        // ignore
      }
    }
    wsClientsByProjectId.delete(id);
  }

  // Remove project file from disk
  try {
    await unlink(projectFilePath(id));
  } catch {
    // ignore errors (file may not exist)
  }

  res.status(204).end();
});

const server = http.createServer(app);

// WebSocket: /ws/projects?id=<projectId>
const wss = new WebSocketServer({
  server,
  path: "/ws/projects",
});

function getProjectIdFromUrl(url) {
  try {
    const u = new URL(url, "http://localhost");
    return u.searchParams.get("id");
  } catch {
    return null;
  }
}

wss.on("connection", (ws, req) => {
  const projectId = getProjectIdFromUrl(req.url || "");
  const project = projectId ? projects.get(projectId) : null;

  if (!projectId || !project) {
    ws.close();
    return;
  }

  // Register client
  addWsClient(projectId, ws);

  // Send current project immediately
  ws.send(JSON.stringify(project));

  ws.on("close", () => {
    removeWsClient(projectId, ws);
  });
});

const PORT = process.env.PORT || 3000;

// Load projects, then start server
await loadAllProjects();

server.listen(PORT, () => {
  console.log(
    `Backend listening on http://localhost:${PORT}`
  );
});

