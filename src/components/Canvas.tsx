// src/components/Canvas.tsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  CameraState,
  Door,
  FloorGeometry,
  Wall,
  WindowOpening,
  Stair,
  Room,
} from "../types";
import { Tool } from "../types";
import { GRID_SIZE, MIN_ZOOM, MAX_ZOOM } from "../constants";
import {
  gridToScreenRect,
  panCamera,
  screenToGrid,
  zoomCameraOnWheel,
} from "../utils/camera";
import type { GridPoint } from "../utils/selection";
import {
  rectCellsBetween,
  xorRectIntoSelection,
  parseCellKey,
} from "../utils/selection";
import {
  createRoomFromCellKeys,
  hasRoomOverlap,
  perimeterWallsFromCellKeys,
} from "../utils/rooms";
import {
  hitTestWallAtPoint,
  openingSegmentRange,
  computeOpeningRectOnWall,
} from "../utils/openings";
import {
  findRoomAtGrid,
  findWallsAroundRoom,
  removeSingleWallAndOpenings,
  removeWallsAndOpenings,
} from "../utils/erase";
import { useTheme } from "../theme";

interface CanvasProps {
  geometry: FloorGeometry;
  underlayGeometry?: FloorGeometry;
  camera: CameraState;
  setCamera: (cam: CameraState) => void;
  currentTool: Tool;
  onCommitGeometry: (newGeom: FloorGeometry) => void;
  onSelectRoom?: (roomId: string | null) => void;

  // Optional – currently not used for UI control, but wired up from ProjectView
  onNavigateLevel?: (levelId: string) => void;
  stairTargetLevelId?: string | null;
}

type MouseButton = 0 | 1 | 2;

interface OpeningDraft {
  wall: Wall;
  tStart: number;
  tCurrent: number;
}

interface CanvasPalette {
  gridLine: string;
  roomFill: string;
  roomFillDimmed: string;
  wall: string;
  wallDimmed: string;
  door: string;
  window: string;
  selectionSolid: string;
  selectionPreview: string;
  draftWall: string;
  draftOpening: string;
  hoverBorder: string;
}

function getCanvasPalette(theme: string): CanvasPalette {
  if (theme === "dark") {
    return {
      gridLine: "rgba(255,255,255,0.35)",
      roomFill: "rgba(135,206,250,0.30)",
      roomFillDimmed: "rgba(135,206,250,0.12)",
      wall: "rgba(255,255,255,0.80)",
      wallDimmed: "rgba(255,255,255,0.30)",
      door: "rgba(144,238,144,0.95)",
      window: "rgba(173,216,230,0.95)",
      selectionSolid: "rgba(135,206,250,0.55)",
      selectionPreview: "rgba(135,206,250,0.28)",
      draftWall: "rgba(255,255,255,0.55)",
      draftOpening: "rgba(144,238,144,0.65)",
      hoverBorder: "rgba(255,255,255,0.65)",
    };
  }

  if (theme === "blueprint") {
    return {
      gridLine: "rgba(0,255,255,0.45)",
      roomFill: "rgba(0,191,255,0.30)",
      roomFillDimmed: "rgba(0,191,255,0.14)",
      wall: "rgba(240,248,255,0.90)",
      wallDimmed: "rgba(240,248,255,0.40)",
      door: "rgba(144,238,144,0.95)",
      window: "rgba(176,224,230,0.95)",
      selectionSolid: "rgba(135,206,250,0.60)",
      selectionPreview: "rgba(135,206,250,0.30)",
      draftWall: "rgba(240,248,255,0.70)",
      draftOpening: "rgba(144,238,144,0.70)",
      hoverBorder: "rgba(240,248,255,0.70)",
    };
  }

  return {
    gridLine: "rgba(0,0,0,0.25)",
    roomFill: "rgba(0,0,120,0.22)",
    roomFillDimmed: "rgba(0,0,120,0.10)",
    wall: "rgba(0,0,0,0.80)",
    wallDimmed: "rgba(0,0,0,0.20)",
    door: "rgba(0,180,0,0.85)",
    window: "rgba(0,150,200,0.85)",
    selectionSolid: "rgba(50,150,255,0.35)",
    selectionPreview: "rgba(50,150,255,0.20)",
    draftWall: "rgba(0,0,0,0.45)",
    draftOpening: "rgba(0,255,0,0.50)",
    hoverBorder: "rgba(0,0,0,0.45)",
  };
}

// ---------- Drag ownership helpers (airtight) ------------------------

type WallKey = string;

function wallKey(w: Pick<Wall, "x1" | "y1" | "x2" | "y2">): WallKey {
  // Normalize direction so A->B equals B->A
  const ax = w.x1,
    ay = w.y1,
    bx = w.x2,
    by = w.y2;
  if (ax < bx || (ax === bx && ay <= by)) {
    return `${ax},${ay}|${bx},${by}`;
  }
  return `${bx},${by}|${ax},${ay}`;
}

function roomCellKeySet(room: any): Set<string> {
  if (room.cellKeys && room.cellKeys.length > 0) {
    return new Set<string>(room.cellKeys);
  }
  // Fallback for rectangular rooms (can be larger, but keeps behavior correct)
  const keys = new Set<string>();
  for (let y = room.y; y < room.y + room.height; y++) {
    for (let x = room.x; x < room.x + room.width; x++) {
      keys.add(`${x},${y}`);
    }
  }
  return keys;
}

function perimeterWallKeysForRoom(room: any): Set<WallKey> {
  const cells = roomCellKeySet(room);
  const perimWalls = perimeterWallsFromCellKeys(cells, () => "");
  const keys = new Set<WallKey>();
  for (const w of perimWalls) keys.add(wallKey(w));
  return keys;
}

function computeOwnedWallIds(
  geometry: FloorGeometry,
  draggedRoomId: string
): Set<string> {
  const rooms = geometry.rooms ?? [];
  const allRoomPerims = new Map<string, Set<WallKey>>();
  const counts = new Map<WallKey, number>();

  for (const r of rooms) {
    const ks = perimeterWallKeysForRoom(r as any);
    allRoomPerims.set(r.id, ks);
    for (const k of ks) counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  const myPerim = allRoomPerims.get(draggedRoomId) ?? new Set<WallKey>();

  // Only walls that belong to exactly one room (this one) are "owned" and movable.
  const ownedKeys = new Set<WallKey>();
  for (const k of myPerim) {
    if ((counts.get(k) ?? 0) === 1) ownedKeys.add(k);
  }

  // Match existing geometry walls by key
  const ownedWallIds = new Set<string>();
  for (const w of geometry.walls) {
    if (ownedKeys.has(wallKey(w))) ownedWallIds.add(w.id);
  }

  return ownedWallIds;
}

// --------------------------------------------------------------------

export const Canvas: React.FC<CanvasProps> = ({
  geometry,
  underlayGeometry,
  camera,
  setCamera,
  currentTool,
  onCommitGeometry,
  onSelectRoom,
  onNavigateLevel, // currently unused but kept for future
  stairTargetLevelId,
}) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { theme } = useTheme();
  const palette = getCanvasPalette(theme);

  const canvasBackground =
    theme === "dark" ? "#101010" : theme === "blueprint" ? "#00152e" : "#f4f4f8";

  const [dragStartCell, setDragStartCell] = useState<GridPoint | null>(null);
  const [dragCurrentCell, setDragCurrentCell] = useState<GridPoint | null>(null);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());

  const [wallStartCell, setWallStartCell] = useState<GridPoint | null>(null);
  const [wallCurrentCell, setWallCurrentCell] = useState<GridPoint | null>(null);

  const [openingDraft, setOpeningDraft] = useState<OpeningDraft | null>(null);

  const [stairDraftStart, setStairDraftStart] = useState<GridPoint | null>(null);
  const [stairDraftCurrent, setStairDraftCurrent] = useState<GridPoint | null>(null);
  const [editingStairId, setEditingStairId] = useState<string | null>(null);

  const [isPanning, setIsPanning] = useState(false);
  const [panLast, setPanLast] = useState<{ x: number; y: number } | null>(null);

  const [hoverCell, setHoverCell] = useState<GridPoint | null>(null);

  const [roomDragState, setRoomDragState] = useState<{
    roomId: string;
    startCell: GridPoint;
    ownedWallIds: Set<string>;
  } | null>(null);

  const [roomDragPreview, setRoomDragPreview] = useState<{
    roomId: string;
    dx: number;
    dy: number;
    ownedWallIds: Set<string>;
  } | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const getRootRect = useCallback(() => {
    const el = rootRef.current;
    return el ? el.getBoundingClientRect() : new DOMRect(0, 0, 1, 1);
  }, []);

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const rect = getRootRect();
    const next = zoomCameraOnWheel(
      camera,
      e.deltaY,
      e.clientX,
      e.clientY,
      rect,
      { minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM }
    );
    setCamera(next);
  }

  function beginPan(e: React.MouseEvent) {
    setIsPanning(true);
    setPanLast({ x: e.clientX, y: e.clientY });
  }
  function endPan() {
    setIsPanning(false);
    setPanLast(null);
  }

  function findStairAtCell(cell: GridPoint): Stair | null {
    const stairs = geometry.stairs ?? [];
    for (const s of stairs) {
      if (
        cell.x >= s.x &&
        cell.x < s.x + s.width &&
        cell.y >= s.y &&
        cell.y < s.y + s.length
      ) {
        return s;
      }
    }
    return null;
  }

  function handleMouseDown(e: React.MouseEvent) {
    e.preventDefault();

    const target = e.target as HTMLElement;
    if (target.closest(".selection-toolbar")) return;

    const button = e.button as MouseButton;

    if (button === 1 || button === 2) {
      beginPan(e);
      return;
    }

    const rect = getRootRect();
    const cell = screenToGrid(e.clientX, e.clientY, rect, camera, GRID_SIZE);

    if (currentTool !== Tool.Stair) {
      setStairDraftStart(null);
      setStairDraftCurrent(null);
      setEditingStairId(null);
    }

    if (currentTool === Tool.Room && button === 0) {
      const existing = findRoomAtGrid(cell.x, cell.y, geometry.rooms);
      if (existing) {
        onSelectRoom?.(existing.id);

        // Airtight: only move walls uniquely owned by this room (never shared).
        const ownedWallIds = computeOwnedWallIds(geometry, existing.id);

        setRoomDragState({
          roomId: existing.id,
          startCell: cell,
          ownedWallIds,
        });
        setRoomDragPreview(null);

        // Cancel any in-progress room drafting
        setDragStartCell(null);
        setDragCurrentCell(null);
        setSelectedCells(prev => prev);

        return;
      }

      setDragStartCell(cell);
      setDragCurrentCell(cell);
      return;
    }

    if (currentTool === Tool.Pan && button === 0) {
      beginPan(e);
      return;
    }

    if (currentTool === Tool.Stair && button === 0) {
      const hit = findStairAtCell(cell);
      if (hit) {
        setEditingStairId(hit.id);
        setStairDraftStart({ x: hit.x, y: hit.y });
        setStairDraftCurrent({
          x: hit.x + hit.width - 1,
          y: hit.y + hit.length - 1,
        });
        onSelectRoom?.(null);
        return;
      }

      setEditingStairId(null);
      setStairDraftStart(cell);
      setStairDraftCurrent(cell);
      onSelectRoom?.(null);
      return;
    }

    if (currentTool === Tool.Wall && button === 0) {
      setWallStartCell(cell);
      setWallCurrentCell(cell);
      return;
    }

    if ((currentTool === Tool.Door || currentTool === Tool.Window) && button === 0) {
      const hit = hitTestWallAtPoint(geometry.walls, e.clientX, e.clientY, rect, camera);
      if (hit) {
        setOpeningDraft({ wall: hit.wall, tStart: hit.t, tCurrent: hit.t });
      }
      return;
    }

    if (currentTool === Tool.Erase && button === 0) {
      handleEraseAtPoint(e.clientX, e.clientY);
    }
  }

  function handleMouseMove(e: React.MouseEvent) {
    const rect = getRootRect();
    const cell = screenToGrid(e.clientX, e.clientY, rect, camera, GRID_SIZE);
    setHoverCell(cell);

    if (isPanning && panLast) {
      const dx = e.clientX - panLast.x;
      const dy = e.clientY - panLast.y;
      setPanLast({ x: e.clientX, y: e.clientY });
      setCamera(panCamera(camera, dx, dy));
      return;
    }

    if (currentTool === Tool.Room && roomDragState && (e.buttons & 1)) {
      const dx = cell.x - roomDragState.startCell.x;
      const dy = cell.y - roomDragState.startCell.y;

      if (dx === 0 && dy === 0) {
        setRoomDragPreview(null);
      } else {
        setRoomDragPreview({
          roomId: roomDragState.roomId,
          dx,
          dy,
          ownedWallIds: roomDragState.ownedWallIds,
        });
      }
      return;
    }

    if (currentTool === Tool.Stair && (e.buttons & 1)) {
      if (stairDraftStart) {
        setStairDraftCurrent(cell);
        return;
      }
    }

    if (dragStartCell) {
      setDragCurrentCell(cell);
      return;
    }

    if (wallStartCell) {
      setWallCurrentCell(cell);
      return;
    }

    if (openingDraft) {
      const hit = hitTestWallAtPoint([openingDraft.wall], e.clientX, e.clientY, rect, camera);
      if (hit) setOpeningDraft({ ...openingDraft, tCurrent: hit.t });
    }

    if (currentTool === Tool.Erase && (e.buttons & 1)) {
      handleEraseAtPoint(e.clientX, e.clientY);
    }
  }

  function finalizeStairDraft(start: GridPoint, end: GridPoint, editingId: string | null) {
    const minX = Math.min(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxX = Math.max(start.x, end.x);
    const maxY = Math.max(start.y, end.y);

    const width = maxX - minX + 1;
    const length = maxY - minY + 1;
    if (width <= 0 || length <= 0) return;

    const stairs = geometry.stairs ?? [];

    if (editingId) {
      const nextStairs = stairs.map(s =>
        s.id === editingId ? { ...s, x: minX, y: minY, width, length } : s
      );
      onCommitGeometry({ ...geometry, stairs: nextStairs });
      return;
    }

    const stair: Stair = {
      id: makeId("stair"),
      x: minX,
      y: minY,
      width,
      length,
      type: "straight",
      direction: "up",
      linkId: makeId("stair-link"),
      targetLevelId: stairTargetLevelId ?? "",
    };

    onCommitGeometry({ ...geometry, stairs: [...stairs, stair] });
  }

  function handleMouseUp(e: React.MouseEvent) {
    const button = e.button as MouseButton;

    if (isPanning && (button === 0 || button === 1 || button === 2)) {
      endPan();
      return;
    }

    const rect = getRootRect();
    const cell = screenToGrid(e.clientX, e.clientY, rect, camera, GRID_SIZE);

    if (currentTool === Tool.Room && roomDragState) {
      const dragState = roomDragState;

      const dx =
        roomDragPreview?.roomId === dragState.roomId
          ? roomDragPreview.dx
          : cell.x - dragState.startCell.x;

      const dy =
        roomDragPreview?.roomId === dragState.roomId
          ? roomDragPreview.dy
          : cell.y - dragState.startCell.y;

      setRoomDragState(null);
      setRoomDragPreview(null);

      if (dx !== 0 || dy !== 0) {
        const nextRooms = geometry.rooms.map(r => {
          if (r.id !== dragState.roomId) return r as any;

          const room: any = r;

          if (room.cellKeys && room.cellKeys.length > 0) {
            const newCellKeys = room.cellKeys.map((key: string) => {
              const { x, y } = parseCellKey(key);
              return `${x + dx},${y + dy}`;
            });

            const xs = newCellKeys.map((k: string) => parseCellKey(k).x);
            const ys = newCellKeys.map((k: string) => parseCellKey(k).y);
            const minX = Math.min(...xs);
            const minY = Math.min(...ys);
            const maxX = Math.max(...xs);
            const maxY = Math.max(...ys);

            return {
              ...room,
              cellKeys: newCellKeys,
              x: minX,
              y: minY,
              width: maxX - minX + 1,
              height: maxY - minY + 1,
            };
          }

          return { ...room, x: room.x + dx, y: room.y + dy };
        });

        const nextWalls = geometry.walls.map(w => {
          if (!dragState.ownedWallIds.has(w.id)) return w;
          return { ...w, x1: w.x1 + dx, y1: w.y1 + dy, x2: w.x2 + dx, y2: w.y2 + dy };
        });

        onCommitGeometry({ ...geometry, rooms: nextRooms as any, walls: nextWalls });
        return;
      }
    }

    if (currentTool === Tool.Stair && stairDraftStart && stairDraftCurrent) {
      finalizeStairDraft(stairDraftStart, stairDraftCurrent, editingStairId);
      setStairDraftStart(null);
      setStairDraftCurrent(null);
      setEditingStairId(null);
      return;
    }

    if (currentTool === Tool.Room && dragStartCell) {
      const rectCells = rectCellsBetween(dragStartCell, cell);
      setSelectedCells(prev => xorRectIntoSelection(prev, rectCells));
      setDragStartCell(null);
      setDragCurrentCell(null);
    }

    if (currentTool === Tool.Wall && wallStartCell) {
      const wall = finalizeWallDraft(wallStartCell, cell);
      setWallStartCell(null);
      setWallCurrentCell(null);
      if (wall) {
        onCommitGeometry({
          ...geometry,
          walls: [...geometry.walls, { ...wall, id: makeId("wall") }],
        });
      }
    }

    if ((currentTool === Tool.Door || currentTool === Tool.Window) && openingDraft) {
      const range = openingSegmentRange(openingDraft.wall, openingDraft.tStart, openingDraft.tCurrent);
      if (range) {
        if (currentTool === Tool.Door) {
          const door: Door = {
            id: makeId("door"),
            wallId: openingDraft.wall.id,
            segStart: range.segStart,
            segEnd: range.segEnd,
          };
          onCommitGeometry({ ...geometry, doors: [...geometry.doors, door] });
        } else {
          const win: WindowOpening = {
            id: makeId("window"),
            wallId: openingDraft.wall.id,
            segStart: range.segStart,
            segEnd: range.segEnd,
          };
          onCommitGeometry({ ...geometry, windows: [...geometry.windows, win] });
        }
      }
      setOpeningDraft(null);
    }
  }

  function handleMouseLeave() {
    setHoverCell(null);
    setDragCurrentCell(null);

    if (isPanning) endPan();

    setRoomDragPreview(null);

    setStairDraftStart(null);
    setStairDraftCurrent(null);
    setEditingStairId(null);
    setRoomDragState(null);
  }

  function finalizeWallDraft(start: GridPoint, end: GridPoint): Wall | null {
    const x1 = start.x;
    const y1 = start.y;
    const x2 = end.x;
    const y2 = end.y;

    if (x1 === x2 && y1 === y2) return null;

    return { id: "", x1, y1, x2, y2 };
  }

  function handleEraseAtPoint(clientX: number, clientY: number) {
    const rect = getRootRect();
    const cell = screenToGrid(clientX, clientY, rect, camera, GRID_SIZE);

    const stair = findStairAtCell(cell);
    if (stair) {
      onCommitGeometry({
        ...geometry,
        stairs: (geometry.stairs ?? []).filter(s => s.id !== stair.id),
      });
      return;
    }

    const hit = hitTestWallAtPoint(geometry.walls, clientX, clientY, rect, camera);
    if (hit) {
      onCommitGeometry(removeSingleWallAndOpenings(hit.wall, geometry));
      return;
    }

    const room = findRoomAtGrid(cell.x, cell.y, geometry.rooms);
    if (room) {
      const wallsToRemove = findWallsAroundRoom(room, geometry.walls);
      let newGeom: FloorGeometry = {
        ...geometry,
        rooms: geometry.rooms.filter(r => r.id !== room.id),
      };
      newGeom = removeWallsAndOpenings(wallsToRemove, newGeom);
      onCommitGeometry(newGeom);
    }
  }

  function confirmRoomSelection() {
    if (selectedCells.size === 0) return;

    const room = createRoomFromCellKeys(selectedCells, makeId("room"));
    if (!room) {
      setSelectedCells(new Set());
      return;
    }

    if (hasRoomOverlap(geometry.rooms, room)) {
      setSelectedCells(new Set());
      return;
    }

    const walls = perimeterWallsFromCellKeys(selectedCells, () => makeId("wall"));

    onCommitGeometry({
      ...geometry,
      rooms: [...geometry.rooms, room],
      walls: [...geometry.walls, ...walls],
    });

    onSelectRoom?.(room.id);
    setSelectedCells(new Set());
  }

  function cancelRoomSelection() {
    setSelectedCells(new Set());
  }

  const selectionToolbarStyle = (() => {
    if (selectedCells.size === 0) return null;
    const cells = Array.from(selectedCells);
    const coords = cells.map(c => {
      const [x, y] = c.split(",").map(v => parseInt(v, 10));
      return { x, y };
    });
    const xs = coords.map(c => c.x);
    const ys = coords.map(c => c.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    const rect = gridToScreenRect(minX, minY, maxX + 1, maxY + 1, camera, GRID_SIZE);
    return { left: rect.left + rect.width + 8, top: rect.top };
  })();

  return (
    <div
      ref={rootRef}
      className="canvas-root"
      style={{ backgroundColor: canvasBackground }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onContextMenu={e => e.preventDefault()}
    >
      <GridLayer camera={camera} palette={palette} />

      {underlayGeometry && (
        <GeometryLayer geometry={underlayGeometry} camera={camera} palette={palette} dimmed />
      )}

      <GeometryLayer
        geometry={geometry}
        camera={camera}
        palette={palette}
        dragPreview={roomDragPreview}
      />

      <DraftSelectionLayer
        selectedCells={selectedCells}
        dragStartCell={dragStartCell}
        dragCurrentCell={dragCurrentCell}
        camera={camera}
        palette={palette}
      />

      <DraftWallLayer start={wallStartCell} current={wallCurrentCell} camera={camera} palette={palette} />

      <DraftOpeningLayer opening={openingDraft} camera={camera} palette={palette} />

      {stairDraftStart && stairDraftCurrent && (
        <DraftStairLayer start={stairDraftStart} current={stairDraftCurrent} camera={camera} palette={palette} />
      )}

      <HoverCellLayer hoverCell={hoverCell} camera={camera} palette={palette} />

      {selectionToolbarStyle && (
        <div
          className="selection-toolbar"
          style={{
            position: "absolute",
            left: selectionToolbarStyle.left,
            top: selectionToolbarStyle.top,
          }}
          onMouseDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
        >
          <button onClick={confirmRoomSelection}>✓</button>
          <button onClick={cancelRoomSelection}>✕</button>
        </div>
      )}
    </div>
  );
};

// layers -------------------------------------------------------------

const GridLayer: React.FC<{
  camera: CameraState;
  palette: CanvasPalette;
}> = ({ camera, palette }) => {
  const gridColor = palette.gridLine;
  const style: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    backgroundImage: `linear-gradient(to right, ${gridColor} 1px, transparent 1px),
                      linear-gradient(to bottom, ${gridColor} 1px, transparent 1px)`,
    backgroundSize: `${GRID_SIZE * camera.zoom}px ${GRID_SIZE * camera.zoom}px`,
    backgroundPosition: `${camera.offset.x}px ${camera.offset.y}px`,
    pointerEvents: "none",
  };
  return <div style={style} />;
};

type DragPreview = {
  roomId: string;
  dx: number;
  dy: number;
  ownedWallIds: Set<string>;
};

const GeometryLayer: React.FC<{
  geometry: FloorGeometry;
  camera: CameraState;
  palette: CanvasPalette;
  dimmed?: boolean;
  dragPreview?: DragPreview | null;
}> = ({ geometry, camera, palette, dimmed, dragPreview }) => {
  const baseWallColor = dimmed ? palette.wallDimmed : palette.wall;
  const baseRoomFill = dimmed ? palette.roomFillDimmed : palette.roomFill;

  const stairs = geometry.stairs ?? [];

  const hideRoomId = dragPreview?.roomId ?? null;
  const hideWallIds = dragPreview?.ownedWallIds ?? null;

  // Helper for preview shifting
  const shiftWall = useCallback(
    (w: Wall, dx: number, dy: number): Wall => ({
      ...w,
      x1: w.x1 + dx,
      y1: w.y1 + dy,
      x2: w.x2 + dx,
      y2: w.y2 + dy,
    }),
    []
  );

  const draggedRoom = hideRoomId
    ? geometry.rooms.find(r => r.id === hideRoomId)
    : undefined;

  const draggedWalls = useMemo(() => {
    if (!dragPreview || !hideWallIds) return [] as Wall[];
    return geometry.walls.filter(w => hideWallIds.has(w.id));
  }, [dragPreview, hideWallIds, geometry.walls]);

  const draggedDoors = useMemo(() => {
    if (!dragPreview || !hideWallIds) return [] as Door[];
    return geometry.doors.filter(d => hideWallIds.has(d.wallId));
  }, [dragPreview, hideWallIds, geometry.doors]);

  const draggedWindows = useMemo(() => {
    if (!dragPreview || !hideWallIds) return [] as WindowOpening[];
    return geometry.windows.filter(w => hideWallIds.has(w.wallId));
  }, [dragPreview, hideWallIds, geometry.windows]);

  return (
    <div className="geometry-layer">
      {/* Rooms */}
      {geometry.rooms.map(room => {
        if (hideRoomId && room.id === hideRoomId) return null;

        const fillColor = room.color ?? baseRoomFill;

        if ((room as any).cellKeys && (room as any).cellKeys.length > 0) {
          const cellKeys = (room as any).cellKeys as string[];
          return (
            <React.Fragment key={room.id}>
              {cellKeys.map(key => {
                const { x, y } = parseCellKey(key);
                const rect = gridToScreenRect(x, y, x + 1, y + 1, camera, GRID_SIZE);
                return (
                  <div
                    key={`${room.id}-${key}`}
                    style={{
                      position: "absolute",
                      left: rect.left,
                      top: rect.top,
                      width: rect.width,
                      height: rect.height,
                      backgroundColor: fillColor,
                      boxSizing: "border-box",
                      pointerEvents: "none",
                    }}
                  />
                );
              })}

              {(room as any).name &&
                (() => {
                  const xs: number[] = [];
                  const ys: number[] = [];
                  cellKeys.forEach(key => {
                    const { x, y } = parseCellKey(key);
                    xs.push(x);
                    ys.push(y);
                  });
                  const minX = Math.min(...xs);
                  const minY = Math.min(...ys);
                  const maxX = Math.max(...xs);
                  const maxY = Math.max(...ys);
                  const rect = gridToScreenRect(minX, minY, maxX + 1, maxY + 1, camera, GRID_SIZE);
                  return (
                    <div
                      key={`${room.id}-label`}
                      style={{
                        position: "absolute",
                        left: rect.left,
                        top: rect.top,
                        width: rect.width,
                        height: rect.height,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        pointerEvents: "none",
                        fontSize: 11,
                        opacity: 0.9,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {(room as any).name}
                    </div>
                  );
                })()}
            </React.Fragment>
          );
        }

        const rect = gridToScreenRect(
          (room as any).x,
          (room as any).y,
          (room as any).x + (room as any).width,
          (room as any).y + (room as any).height,
          camera,
          GRID_SIZE
        );
        return (
          <div
            key={room.id}
            style={{
              position: "absolute",
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
              backgroundColor: fillColor,
              border: `1px solid ${baseWallColor}`,
              boxSizing: "border-box",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "flex-start",
              pointerEvents: "none",
            }}
          >
            {(room as any).name && (
              <div
                style={{
                  pointerEvents: "none",
                  fontSize: 11,
                  padding: 2,
                  opacity: 0.9,
                  whiteSpace: "nowrap",
                }}
              >
                {(room as any).name}
              </div>
            )}
          </div>
        );
      })}

      {/* Walls */}
      {geometry.walls.map(wall => {
        if (hideWallIds && hideWallIds.has(wall.id)) return null;
        const seg = wallToScreenSegment(wall, camera);
        return (
          <div
            key={wall.id}
            style={{
              position: "absolute",
              left: seg.left,
              top: seg.top,
              width: seg.width,
              height: seg.height,
              backgroundColor: baseWallColor,
              transformOrigin: "0 50%",
              transform: `rotate(${seg.angleDeg}deg)`,
            }}
          />
        );
      })}

      {/* Doors */}
      {geometry.doors.map(door => {
        if (hideWallIds && hideWallIds.has(door.wallId)) return null;
        const wall = geometry.walls.find(w => w.id === door.wallId);
        if (!wall) return null;
        const rect = computeOpeningRectOnWall(wall, door.segStart, door.segEnd, camera);
        return (
          <div
            key={door.id}
            style={{
              position: "absolute",
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
              backgroundColor: palette.door,
              transformOrigin: "0 50%",
              transform: `rotate(${rect.angleDeg}deg)`,
            }}
          />
        );
      })}

      {/* Windows */}
      {geometry.windows.map(win => {
        if (hideWallIds && hideWallIds.has(win.wallId)) return null;
        const wall = geometry.walls.find(w => w.id === win.wallId);
        if (!wall) return null;
        const rect = computeOpeningRectOnWall(wall, win.segStart, win.segEnd, camera);
        return (
          <div
            key={win.id}
            style={{
              position: "absolute",
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
              backgroundColor: palette.window,
              transformOrigin: "0 50%",
              transform: `rotate(${rect.angleDeg}deg)`,
            }}
          />
        );
      })}

      {/* Stairs */}
      {stairs.map(stair => {
        const rect = gridToScreenRect(stair.x, stair.y, stair.x + stair.width, stair.y + stair.length, camera, GRID_SIZE);

        const stepCount = Math.max(3, Math.min(6, stair.length));
        const stepNodes: React.ReactNode[] = [];
        for (let i = 0; i < stepCount; i++) {
          const t = i / (stepCount - 1 || 1);
          const stepHeight = rect.height / (stepCount * 2);
          const centerY = rect.top + rect.height * 0.25 + t * rect.height * 0.5;

          const widthFactor = 0.4 + 0.6 * (1 - t);
          const stepWidth = rect.width * widthFactor;
          const left = rect.left + (rect.width - stepWidth) / 2;

          stepNodes.push(
            <div
              key={`${stair.id}-step-${i}`}
              style={{
                position: "absolute",
                left,
                top: centerY - stepHeight / 2,
                width: stepWidth,
                height: stepHeight,
                backgroundColor: dimmed ? palette.wallDimmed : palette.wall,
                borderRadius: stepHeight / 2,
                pointerEvents: "none",
              }}
            />
          );
        }

        return (
          <React.Fragment key={stair.id}>
            <div
              style={{
                position: "absolute",
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height,
                border: `1px solid ${dimmed ? palette.wallDimmed : palette.wall}`,
                boxSizing: "border-box",
                pointerEvents: "none",
              }}
            />
            {stepNodes}
          </React.Fragment>
        );
      })}

      {/* Drag ghost (room + owned walls + openings) */}
      {dragPreview && draggedRoom && (
        <DragGhost
          room={draggedRoom as any}
          ownedWalls={draggedWalls}
          ownedDoors={draggedDoors}
          ownedWindows={draggedWindows}
          dx={dragPreview.dx}
          dy={dragPreview.dy}
          camera={camera}
          palette={palette}
          baseWallColor={baseWallColor}
          baseRoomFill={baseRoomFill}
          dimmed={!!dimmed}
        />
      )}
    </div>
  );
};

const DragGhost: React.FC<{
  room: any;
  ownedWalls: Wall[];
  ownedDoors: Door[];
  ownedWindows: WindowOpening[];
  dx: number;
  dy: number;
  camera: CameraState;
  palette: CanvasPalette;
  baseWallColor: string;
  baseRoomFill: string;
  dimmed: boolean;
}> = ({
  room,
  ownedWalls,
  ownedDoors,
  ownedWindows,
  dx,
  dy,
  camera,
  palette,
  baseWallColor,
  baseRoomFill,
}) => {
  const ghostOpacity = 0.55;

  const shiftedWalls = ownedWalls.map(w => ({
    ...w,
    x1: w.x1 + dx,
    y1: w.y1 + dy,
    x2: w.x2 + dx,
    y2: w.y2 + dy,
  }));

  return (
    <>
      {/* Room fill ghost */}
      {room.cellKeys && room.cellKeys.length > 0 ? (
        <React.Fragment>
          {room.cellKeys.map((key: string) => {
            const { x, y } = parseCellKey(key);
            const rect = gridToScreenRect(x + dx, y + dy, x + dx + 1, y + dy + 1, camera, GRID_SIZE);
            return (
              <div
                key={`ghost-${room.id}-${key}`}
                style={{
                  position: "absolute",
                  left: rect.left,
                  top: rect.top,
                  width: rect.width,
                  height: rect.height,
                  backgroundColor: room.color ?? baseRoomFill,
                  opacity: ghostOpacity,
                  pointerEvents: "none",
                }}
              />
            );
          })}

          {room.name &&
            (() => {
              const xs: number[] = [];
              const ys: number[] = [];
              room.cellKeys.forEach((key: string) => {
                const { x, y } = parseCellKey(key);
                xs.push(x + dx);
                ys.push(y + dy);
              });
              const minX = Math.min(...xs);
              const minY = Math.min(...ys);
              const maxX = Math.max(...xs);
              const maxY = Math.max(...ys);
              const rect = gridToScreenRect(minX, minY, maxX + 1, maxY + 1, camera, GRID_SIZE);
              return (
                <div
                  key={`ghost-${room.id}-label`}
                  style={{
                    position: "absolute",
                    left: rect.left,
                    top: rect.top,
                    width: rect.width,
                    height: rect.height,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    pointerEvents: "none",
                    fontSize: 11,
                    opacity: ghostOpacity,
                    whiteSpace: "nowrap",
                  }}
                >
                  {room.name}
                </div>
              );
            })()}
        </React.Fragment>
      ) : (
        (() => {
          const rect = gridToScreenRect(
            room.x + dx,
            room.y + dy,
            room.x + dx + room.width,
            room.y + dy + room.height,
            camera,
            GRID_SIZE
          );
          return (
            <div
              key={`ghost-${room.id}-rect`}
              style={{
                position: "absolute",
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height,
                backgroundColor: room.color ?? baseRoomFill,
                opacity: ghostOpacity,
                border: `1px solid ${baseWallColor}`,
                boxSizing: "border-box",
                pointerEvents: "none",
              }}
            />
          );
        })()
      )}

      {/* Walls ghost */}
      {shiftedWalls.map(w => {
        const seg = wallToScreenSegment(w, camera);
        return (
          <div
            key={`ghost-wall-${w.id}`}
            style={{
              position: "absolute",
              left: seg.left,
              top: seg.top,
              width: seg.width,
              height: seg.height,
              backgroundColor: baseWallColor,
              opacity: ghostOpacity,
              transformOrigin: "0 50%",
              transform: `rotate(${seg.angleDeg}deg)`,
              pointerEvents: "none",
            }}
          />
        );
      })}

      {/* Doors ghost */}
      {ownedDoors.map(d => {
        const w0 = ownedWalls.find(w => w.id === d.wallId);
        if (!w0) return null;
        const w = { ...w0, x1: w0.x1 + dx, y1: w0.y1 + dy, x2: w0.x2 + dx, y2: w0.y2 + dy };
        const rect = computeOpeningRectOnWall(w, d.segStart, d.segEnd, camera);
        return (
          <div
            key={`ghost-door-${d.id}`}
            style={{
              position: "absolute",
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
              backgroundColor: palette.door,
              opacity: ghostOpacity,
              transformOrigin: "0 50%",
              transform: `rotate(${rect.angleDeg}deg)`,
              pointerEvents: "none",
            }}
          />
        );
      })}

      {/* Windows ghost */}
      {ownedWindows.map(win => {
        const w0 = ownedWalls.find(w => w.id === win.wallId);
        if (!w0) return null;
        const w = { ...w0, x1: w0.x1 + dx, y1: w0.y1 + dy, x2: w0.x2 + dx, y2: w0.y2 + dy };
        const rect = computeOpeningRectOnWall(w, win.segStart, win.segEnd, camera);
        return (
          <div
            key={`ghost-win-${win.id}`}
            style={{
              position: "absolute",
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
              backgroundColor: palette.window,
              opacity: ghostOpacity,
              transformOrigin: "0 50%",
              transform: `rotate(${rect.angleDeg}deg)`,
              pointerEvents: "none",
            }}
          />
        );
      })}
    </>
  );
};

function wallToScreenSegment(
  wall: Wall,
  camera: CameraState
): { left: number; top: number; width: number; height: number; angleDeg: number } {
  const thickness = (GRID_SIZE * camera.zoom) / 6;

  const x1Screen = camera.offset.x + wall.x1 * GRID_SIZE * camera.zoom;
  const y1Screen = camera.offset.y + wall.y1 * GRID_SIZE * camera.zoom;
  const x2Screen = camera.offset.x + wall.x2 * GRID_SIZE * camera.zoom;
  const y2Screen = camera.offset.y + wall.y2 * GRID_SIZE * camera.zoom;

  const dx = x2Screen - x1Screen;
  const dy = y2Screen - y1Screen;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angleRad = Math.atan2(dy, dx);
  const angleDeg = (angleRad * 180) / Math.PI;

  return {
    left: x1Screen,
    top: y1Screen - thickness / 2,
    width: length,
    height: thickness,
    angleDeg,
  };
}

const DraftSelectionLayer: React.FC<{
  selectedCells: Set<string>;
  dragStartCell: GridPoint | null;
  dragCurrentCell: GridPoint | null;
  camera: CameraState;
  palette: CanvasPalette;
}> = ({ selectedCells, dragStartCell, dragCurrentCell, camera, palette }) => {
  const items: React.ReactNode[] = [];

  selectedCells.forEach(key => {
    const [x, y] = key.split(",").map(v => parseInt(v, 10));
    const rect = gridToScreenRect(x, y, x + 1, y + 1, camera, GRID_SIZE);
    items.push(
      <div
        key={`sel-${key}`}
        style={{
          position: "absolute",
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          backgroundColor: palette.selectionSolid,
        }}
      />
    );
  });

  let dimsLabel: React.ReactNode = null;

  if (dragStartCell && dragCurrentCell) {
    const rectCells = rectCellsBetween(dragStartCell, dragCurrentCell);

    rectCells.forEach((key, i) => {
      const [x, y] = key.split(",").map(v => parseInt(v, 10));
      const rect = gridToScreenRect(x, y, x + 1, y + 1, camera, GRID_SIZE);
      items.push(
        <div
          key={`preview-${key}-${i}`}
          style={{
            position: "absolute",
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            backgroundColor: palette.selectionPreview,
          }}
        />
      );
    });

    const minX = Math.min(dragStartCell.x, dragCurrentCell.x);
    const minY = Math.min(dragStartCell.y, dragCurrentCell.y);
    const maxX = Math.max(dragStartCell.x, dragCurrentCell.x);
    const maxY = Math.max(dragStartCell.y, dragCurrentCell.y);

    const cols = maxX - minX + 1;
    const rows = maxY - minY + 1;

    const rect = gridToScreenRect(minX, minY, maxX + 1, maxY + 1, camera, GRID_SIZE);

    dimsLabel = (
      <div
        style={{
          position: "absolute",
          left: rect.left,
          top: rect.top - 18,
          padding: "2px 6px",
          fontSize: 11,
          backgroundColor: "rgba(0, 0, 0, 0.6)",
          color: "#fff",
          borderRadius: 3,
          pointerEvents: "none",
          whiteSpace: "nowrap",
        }}
      >
        {rows}x{cols}
      </div>
    );
  }

  return (
    <>
      {items}
      {dimsLabel}
    </>
  );
};

const DraftWallLayer: React.FC<{
  start: GridPoint | null;
  current: GridPoint | null;
  camera: CameraState;
  palette: CanvasPalette;
}> = ({ start, current, camera, palette }) => {
  if (!start || !current) return null;
  if (start.x === current.x && start.y === current.y) return null;

  const wall: Wall = { id: "", x1: start.x, y1: start.y, x2: current.x, y2: current.y };
  const seg = wallToScreenSegment(wall, camera);

  return (
    <div
      style={{
        position: "absolute",
        left: seg.left,
        top: seg.top,
        width: seg.width,
        height: seg.height,
        backgroundColor: palette.draftWall,
        transformOrigin: "0 50%",
        transform: `rotate(${seg.angleDeg}deg)`,
      }}
    />
  );
};

const DraftOpeningLayer: React.FC<{
  opening: OpeningDraft | null;
  camera: CameraState;
  palette: CanvasPalette;
}> = ({ opening, camera, palette }) => {
  if (!opening) return null;
  const range = openingSegmentRange(opening.wall, opening.tStart, opening.tCurrent);
  if (!range) return null;

  const rect = computeOpeningRectOnWall(opening.wall, range.segStart, range.segEnd, camera);
  return (
    <div
      style={{
        position: "absolute",
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        backgroundColor: palette.draftOpening,
        transformOrigin: "0 50%",
        transform: `rotate(${rect.angleDeg}deg)`,
      }}
    />
  );
};

const DraftStairLayer: React.FC<{
  start: GridPoint | null;
  current: GridPoint | null;
  camera: CameraState;
  palette: CanvasPalette;
}> = ({ start, current, camera, palette }) => {
  if (!start || !current) return null;

  const minX = Math.min(start.x, current.x);
  const minY = Math.min(start.y, current.y);
  const maxX = Math.max(start.x, current.x);
  const maxY = Math.max(start.y, current.y);

  const rect = gridToScreenRect(minX, minY, maxX + 1, maxY + 1, camera, GRID_SIZE);

  return (
    <div
      style={{
        position: "absolute",
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        backgroundColor: palette.selectionPreview,
        border: `1px dashed ${palette.hoverBorder}`,
        boxSizing: "border-box",
        pointerEvents: "none",
      }}
    />
  );
};

const HoverCellLayer: React.FC<{
  hoverCell: GridPoint | null;
  camera: CameraState;
  palette: CanvasPalette;
}> = ({ hoverCell, camera, palette }) => {
  if (!hoverCell) return null;
  const rect = gridToScreenRect(
    hoverCell.x,
    hoverCell.y,
    hoverCell.x + 1,
    hoverCell.y + 1,
    camera,
    GRID_SIZE
  );
  return (
    <div
      style={{
        position: "absolute",
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        border: `1px dashed ${palette.hoverBorder}`,
        pointerEvents: "none",
      }}
    />
  );
};

// Simple id factory; replace with UUID or backend ids later
let idCounter = 0;
function makeId(prefix: string): string {
  idCounter++;
  return `${prefix}-${idCounter}`;
}

