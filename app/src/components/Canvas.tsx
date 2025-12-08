// src/components/Canvas.tsx
import React, { useRef, useState, useEffect } from "react";
import "./Canvas.css";
import { GRID_SIZE } from "../types/bastion";
import type {
  Room,
  Wall,
  Door,
  WindowOpening,
  Tool,
  FloorGeometry,
} from "../types/bastion";

import { normalizeWall } from "../utils/walls";
import {
  hitTestWallAtPoint,
  computeOpeningRectOnWall,
} from "../utils/openings";
import {
  createRoomFromCellKeys,
  hasRoomOverlap,
  perimeterWallsForRoom,
} from "../utils/rooms";
import {
  screenToGrid as screenToGridUtil,
  gridToScreenRect as gridToScreenRectUtil,
  zoomCameraOnWheel,
  panCamera,
  type CameraState,
} from "../utils/camera";
import { computeGridBounds } from "../utils/gridBounds";
import {
  xorRectIntoSelection,
  rectCellsBetween,
  cellKeysToPoints,
} from "../utils/selection";
import { findRoomAtGrid, findWallsAroundRoom } from "../utils/erase";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;

type CanvasSnapshot = {
  rooms: Room[];
  walls: Wall[];
  doors: Door[];
  windows: WindowOpening[];
};

type CanvasProps = {
  tool: Tool;
  geometry: FloorGeometry;
  onGeometryChange: (geometry: FloorGeometry) => void;
  underlayGeometry?: FloorGeometry | null;
};

type Point = { x: number; y: number };

const Canvas: React.FC<CanvasProps> = ({
  tool,
  geometry,
  onGeometryChange,
  underlayGeometry,
}) => {
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Camera
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<Point | null>(null);

  // Drag-erase state
  const [isErasing, setIsErasing] = useState(false);

  // Geometry (per-level, seeded from props.geometry)
  const [rooms, setRooms] = useState<Room[]>(() => geometry.rooms ?? []);
  const [walls, setWalls] = useState<Wall[]>(() => geometry.walls ?? []);
  const [doors, setDoors] = useState<Door[]>(() => geometry.doors ?? []);
  const [windows, setWindows] = useState<WindowOpening[]>(
    () => geometry.windows ?? []
  );

  // Room draft: set of selected cells + current drag rectangle
  const [draftCellKeys, setDraftCellKeys] = useState<string[]>([]);
  const [roomDragStart, setRoomDragStart] = useState<Point | null>(null);
  const [roomDragCurrent, setRoomDragCurrent] = useState<Point | null>(null);

  // Manual wall drag
  const [wallDragStart, setWallDragStart] = useState<Point | null>(null);
  const [draftWall, setDraftWall] = useState<Wall | null>(null);

  // Door draft
  const [doorDrag, setDoorDrag] = useState<{
    wallId: string;
    startT: number;
  } | null>(null);
  const [draftDoor, setDraftDoor] = useState<{
    wallId: string;
    segStart: number;
    segEnd: number;
  } | null>(null);

  // Window draft
  const [windowDrag, setWindowDrag] = useState<{
    wallId: string;
    startT: number;
  } | null>(null);
  const [draftWindow, setDraftWindow] = useState<{
    wallId: string;
    segStart: number;
    segEnd: number;
  } | null>(null);

  // Hover
  const [hoverGrid, setHoverGrid] = useState<Point | null>(null);

  // Shape toolbar position
  const [shapeToolbarPos, setShapeToolbarPos] = useState<Point | null>(null);

  // Undo history
  const [history, setHistory] = useState<CanvasSnapshot[]>([]);

  // Sync local geometry when prop changes (e.g. different level)
  useEffect(() => {
    setRooms(geometry.rooms ?? []);
    setWalls(geometry.walls ?? []);
    setDoors(geometry.doors ?? []);
    setWindows(geometry.windows ?? []);
    setDraftCellKeys([]);
    setRoomDragStart(null);
    setRoomDragCurrent(null);
    setShapeToolbarPos(null);
  }, [geometry]);

  // Notify parent on geometry change
  useEffect(() => {
    onGeometryChange({
      ...geometry,
      rooms,
      walls,
      doors,
      windows,
    });
  }, [rooms, walls, doors, windows, onGeometryChange, geometry]);

  const makeSnapshot = (): CanvasSnapshot => ({
    rooms: JSON.parse(JSON.stringify(rooms)),
    walls: JSON.parse(JSON.stringify(walls)),
    doors: JSON.parse(JSON.stringify(doors)),
    windows: JSON.parse(JSON.stringify(windows)),
  });

  const pushSnapshot = () => {
    setHistory((prev) => [...prev, makeSnapshot()]);
  };

  const popSnapshot = () => {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setRooms(last.rooms);
      setWalls(last.walls);
      setDoors(last.doors);
      setWindows(last.windows);
      return prev.slice(0, -1);
    });
  };

  // Ctrl/Cmd+Z undo
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        popSnapshot();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const cellSize = GRID_SIZE * zoom;

  const currentCamera = (): CameraState => ({
    offset,
    zoom,
  });

  const screenToGrid = (clientX: number, clientY: number): Point => {
    const rect = rootRef.current?.getBoundingClientRect() ?? null;
    return screenToGridUtil(
      clientX,
      clientY,
      rect,
      currentCamera(),
      GRID_SIZE
    );
  };

  const gridToScreenRect = (
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ) => {
    return gridToScreenRectUtil(
      x1,
      y1,
      x2,
      y2,
      currentCamera(),
      GRID_SIZE
    );
  };

  const handleWheel: React.WheelEventHandler<HTMLDivElement> = (e) => {
    if (!rootRef.current) return;
    e.preventDefault();

    const rect = rootRef.current.getBoundingClientRect();
    const nextCamera = zoomCameraOnWheel(
      currentCamera(),
      e.deltaY,
      e.clientX,
      e.clientY,
      rect,
      { minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM, zoomStep: 0.1 }
    );

    setOffset(nextCamera.offset);
    setZoom(nextCamera.zoom);
  };

  const handleMouseDown: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (!rootRef.current) return;

    // Pan: middle button OR right button OR pan tool with left button
    const isPanMouseButton = e.button === 1 || e.button === 2;
    if (isPanMouseButton || (tool === "pan" && e.button === 0)) {
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
      return;
    }

    const grid = screenToGrid(e.clientX, e.clientY);
    setHoverGrid(grid);

    // Erase: start drag erase with erase tool + left button
    if (tool === "erase" && e.button === 0) {
      setIsErasing(true);
      eraseAtPoint(e.clientX, e.clientY);
      return;
    }

    // ROOM DRAFT: only use left mouse + room tool
    if (tool === "room" && e.button === 0) {
      setRoomDragStart(grid);
      setRoomDragCurrent(grid);

      const rectStyles = gridToScreenRect(grid.x, grid.y, grid.x + 1, grid.y + 1);
      const { left, top, width } = rectStyles;
      setShapeToolbarPos({
        x: left + width / 2,
        y: top,
      });
      return;
    }

    // WALL START: wall tool + left mouse
    if (tool === "wall" && e.button === 0) {
      const gridSnap = screenToGrid(e.clientX, e.clientY);
      setWallDragStart(gridSnap);
      setDraftWall({
        id: crypto.randomUUID(),
        x1: gridSnap.x,
        y1: gridSnap.y,
        x2: gridSnap.x,
        y2: gridSnap.y,
      });
      return;
    }

    // DOOR: record starting param along wall
    if (tool === "door" && e.button === 0) {
      const hit = hitTestWall(e.clientX, e.clientY);
      if (hit) {
        const { wall, t } = hit;
        setDoorDrag({ wallId: wall.id, startT: t });
      }
      return;
    }

    // WINDOW: record starting param along wall
    if (tool === "window" && e.button === 0) {
      const hit = hitTestWall(e.clientX, e.clientY);
      if (hit) {
        const { wall, t } = hit;
        setWindowDrag({ wallId: wall.id, startT: t });
      }
      return;
    }
  };

  const handleMouseMove: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (!rootRef.current) return;

    const grid = screenToGrid(e.clientX, e.clientY);
    setHoverGrid(grid);

    const leftDown = (e.buttons & 1) === 1;

    if (isPanning && panStart) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;

      setOffset((prev) => {
        const nextCam = panCamera({ offset: prev, zoom }, dx, dy);
        return nextCam.offset;
      });
      setPanStart({ x: e.clientX, y: e.clientY });
      return;
    }

    // ROOM DRAFT PREVIEW: show the current drag rectangle, but do not
    // modify draftCellKeys until MouseUp. This allows XOR behavior.
    if (tool === "room" && roomDragStart) {
      if (!leftDown) {
        return;
      }
      setRoomDragCurrent(grid);
      return;
    }

    // WALL PREVIEW: update draft wall as we drag
    if (tool === "wall" && wallDragStart && draftWall && leftDown) {
      const gridSnap = screenToGrid(e.clientX, e.clientY);
      setDraftWall((prev) =>
        prev
          ? {
              ...prev,
              x2: gridSnap.x,
              y2: gridSnap.y,
            }
          : null
      );
      return;
    }

    // DOOR PREVIEW
    if (tool === "door" && doorDrag && leftDown) {
      const hit = hitTestWall(e.clientX, e.clientY, doorDrag.wallId);
      if (hit) {
        const { wall, t, segments } = hit;
        const start = Math.floor(doorDrag.startT * segments);
        const end = Math.floor(t * segments);
        const segStart = Math.min(start, end);
        const segEnd = Math.max(start, end) + 1;

        setDraftDoor({
          wallId: wall.id,
          segStart,
          segEnd,
        });
      }
      return;
    }

    // WINDOW PREVIEW
    if (tool === "window" && windowDrag && leftDown) {
      const hit = hitTestWall(e.clientX, e.clientY, windowDrag.wallId);
      if (hit) {
        const { wall, t, segments } = hit;
        const start = Math.floor(windowDrag.startT * segments);
        const end = Math.floor(t * segments);
        const segStart = Math.min(start, end);
        const segEnd = Math.max(start, end) + 1;

        setDraftWindow({
          wallId: wall.id,
          segStart,
          segEnd,
        });
      }
      return;
    }

    // ERASE DRAG
    if (tool === "erase" && isErasing) {
      if (!leftDown) {
        setIsErasing(false);
        return;
      }
      eraseAtPoint(e.clientX, e.clientY);
      return;
    }
  };

  const handleMouseUp: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (isPanning) {
      setIsPanning(false);
      setPanStart(null);
    }

    // ROOM DRAFT: on mouse up, XOR the rectangle into the draft selection
    if (tool === "room" && roomDragStart && roomDragCurrent && e.button === 0) {
      const { nextKeys, bounds } = xorRectIntoSelection(
        draftCellKeys,
        roomDragStart,
        roomDragCurrent
      );
      setDraftCellKeys(nextKeys);

      if (bounds) {
        const rectStyles = gridToScreenRect(
          bounds.minX,
          bounds.minY,
          bounds.maxX + 1,
          bounds.maxY + 1
        );
        const { left, top, width } = rectStyles;
        setShapeToolbarPos({
          x: left + width / 2,
          y: top,
        });
      } else {
        setShapeToolbarPos(null);
      }

      setRoomDragStart(null);
      setRoomDragCurrent(null);
    }

    // STOP ERASING
    if (tool === "erase" && isErasing && e.button === 0) {
      setIsErasing(false);
    }

    // WALL FINALIZATION
    if (tool === "wall" && wallDragStart && draftWall && e.button === 0) {
      if (draftWall.x1 !== draftWall.x2 || draftWall.y1 !== draftWall.y2) {
        pushSnapshot();
        const finalWall = normalizeWall(draftWall);
        setWalls((prev) => [...prev, finalWall]);
      }
      setWallDragStart(null);
      setDraftWall(null);
    }

    // DOOR FINALIZATION
    if (tool === "door" && doorDrag && draftDoor && e.button === 0) {
      const { wallId, segStart, segEnd } = draftDoor;
      pushSnapshot();
      setDoors((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          wallId,
          segStart,
          segEnd,
        },
      ]);
      setDoorDrag(null);
      setDraftDoor(null);
    }

    // WINDOW FINALIZATION
    if (tool === "window" && windowDrag && draftWindow && e.button === 0) {
      const { wallId, segStart, segEnd } = draftWindow;
      pushSnapshot();
      setWindows((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          wallId,
          segStart,
          segEnd,
        },
      ]);
      setWindowDrag(null);
      setDraftWindow(null);
    }

    // Clear drag states for safety
    if (e.button === 0) {
      setDoorDrag(null);
      setDraftDoor(null);
      setWindowDrag(null);
      setDraftWindow(null);
      setRoomDragStart(null);
      setRoomDragCurrent(null);
    }
  };

  const hitTestWall = (
    clientX: number,
    clientY: number,
    specificWallId?: string
  ):
    | {
        wall: Wall;
        t: number;
        segmentIndex: number;
        segments: number;
      }
    | null => {
    if (!rootRef.current) return null;

    return hitTestWallAtPoint(clientX, clientY, {
      walls,
      cellSize,
      offset,
      rootRect: rootRef.current.getBoundingClientRect(),
      specificWallId,
    });
  };

  const computeOpeningRect = (
    wall: Wall,
    segStart: number,
    segEnd: number,
    thicknessPx: number
  ):
    | {
        cx: number;
        cy: number;
        width: number;
        height: number;
      }
    | null => {
    return computeOpeningRectOnWall(wall, segStart, segEnd, thicknessPx, {
      cellSize,
      offset,
    });
  };

  const eraseAtPoint = (clientX: number, clientY: number) => {
    const hitWall = hitTestWall(clientX, clientY);
    if (hitWall) {
      const { wall } = hitWall;
      setWalls((prev) => prev.filter((w) => w.id !== wall.id));
      setDoors((prev) => prev.filter((d) => d.wallId !== wall.id));
      setWindows((prev) => prev.filter((w) => w.wallId !== wall.id));
      return;
    }

    const grid = screenToGrid(clientX, clientY);
    const hitRoom = findRoomAtGrid(rooms, grid);
    if (hitRoom) {
      setRooms((prev) => prev.filter((r) => r.id !== hitRoom.id));
      const { wallIdsToErase } = findWallsAroundRoom(hitRoom, walls);
      setWalls((prev) => prev.filter((w) => !wallIdsToErase.has(w.id)));
      setDoors((prev) => prev.filter((d) => !wallIdsToErase.has(d.wallId)));
      setWindows((prev) => prev.filter((w) => !wallIdsToErase.has(w.wallId)));
    }
  };

  const confirmRoom = () => {
    if (draftCellKeys.length === 0) return;

    const newRoom = createRoomFromCellKeys(draftCellKeys);
    if (!newRoom) {
      setDraftCellKeys([]);
      setShapeToolbarPos(null);
      return;
    }

    if (hasRoomOverlap(rooms, newRoom)) {
      setDraftCellKeys([]);
      setShapeToolbarPos(null);
      return;
    }

    const perimeter = perimeterWallsForRoom(newRoom);

    pushSnapshot();
    setRooms((prev) => [...prev, newRoom]);
    // append perimeter walls without merging
    setWalls((prev) => [...prev, ...perimeter]);

    setDraftCellKeys([]);
    setShapeToolbarPos(null);
  };

  const cancelRoom = () => {
    setDraftCellKeys([]);
    setShapeToolbarPos(null);
    setRoomDragStart(null);
    setRoomDragCurrent(null);
  };

  const draftCells = cellKeysToPoints(draftCellKeys);

  // Preview cells for current drag rectangle (not yet XORed into draft)
  let previewCells: Point[] = [];
  if (roomDragStart && roomDragCurrent) {
    previewCells = rectCellsBetween(roomDragStart, roomDragCurrent);
  }

  // Compute geometry-based grid bounds
  const geomBounds = computeGridBounds({
    rooms,
    walls,
    draftCells,
    previewCells,
    underlayGeometry: underlayGeometry ?? null,
  });

  // Expand bounds so the grid always covers the visible viewport
  let minGridX = geomBounds.minGridX;
  let maxGridX = geomBounds.maxGridX;
  let minGridY = geomBounds.minGridY;
  let maxGridY = geomBounds.maxGridY;

  if (rootRef.current) {
    const rect = rootRef.current.getBoundingClientRect();
    const viewWidth = rect.width;
    const viewHeight = rect.height;

    const viewMinGridX = Math.floor((-offset.x) / cellSize) - 2;
    const viewMaxGridX = Math.ceil((viewWidth - offset.x) / cellSize) + 2;
    const viewMinGridY = Math.floor((-offset.y) / cellSize) - 2;
    const viewMaxGridY = Math.ceil((viewHeight - offset.y) / cellSize) + 2;

    minGridX = Math.min(minGridX, viewMinGridX);
    maxGridX = Math.max(maxGridX, viewMaxGridX);
    minGridY = Math.min(minGridY, viewMinGridY);
    maxGridY = Math.max(maxGridY, viewMaxGridY);
  }

  // Grid lines
  const cols = [];
  for (let x = minGridX; x <= maxGridX; x++) {
    const left = x * cellSize + offset.x;
    cols.push(
      <div
        key={`col-${x}`}
        className="grid-line-vertical"
        style={{ left }}
      />
    );
  }

  const rows = [];
  for (let y = minGridY; y <= maxGridY; y++) {
    const top = y * cellSize + offset.y;
    rows.push(
      <div
        key={`row-${y}`}
        className="grid-line-horizontal"
        style={{ top }}
      />
    );
  }

  // Helper to get underlay room style
  const underlayRoomStyle = (r: Room) =>
    gridToScreenRect(r.x, r.y, r.x + r.width, r.y + r.height);

  // Hover cell style
  const hoverStyle =
    hoverGrid &&
    gridToScreenRect(hoverGrid.x, hoverGrid.y, hoverGrid.x + 1, hoverGrid.y + 1);

  return (
    <div
      className="canvas-root"
      ref={rootRef}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onContextMenu={(e) => e.preventDefault()} // allow right-click panning
    >
      {/* Grid */}
      <div className="grid-layer">
        {cols}
        {rows}
      </div>

      {/* Underlay (level below) */}
      {underlayGeometry && (
        <div className="underlay-layer">
          {underlayGeometry.rooms?.map((r) => (
            <div
              key={r.id}
              className="underlay-room"
              style={underlayRoomStyle(r)}
            />
          ))}
          {underlayGeometry.walls?.map((w) => {
            const rect = gridToScreenRect(w.x1, w.y1, w.x2, w.y2);
            return (
              <div
                key={w.id}
                className="underlay-wall"
                style={{
                  left: rect.left,
                  top: rect.top,
                  width: rect.width || 2 * zoom,
                  height: rect.height || 2 * zoom,
                }}
              />
            );
          })}
        </div>
      )}

      {/* Rooms */}
      <div className="rooms-layer">
        {rooms.map((r) => (
          <div
            key={r.id}
            className="room"
            style={gridToScreenRect(r.x, r.y, r.x + r.width, r.y + r.height)}
          />
        ))}
      </div>

      {/* Draft room cells */}
      <div className="draft-layer">
        {draftCells.map((cell) => (
          <div
            key={`draft-${cell.x},${cell.y}`}
            className="draft-cell"
            style={gridToScreenRect(cell.x, cell.y, cell.x + 1, cell.y + 1)}
          />
        ))}

        {/* Current drag preview (not yet XORed into draft) */}
        {previewCells.map((cell) => (
          <div
            key={`preview-${cell.x},${cell.y}`}
            className="draft-preview-cell"
            style={gridToScreenRect(cell.x, cell.y, cell.x + 1, cell.y + 1)}
          />
        ))}
      </div>

      {/* Shape toolbar */}
      {draftCells.length > 0 && shapeToolbarPos && (
        <div
          className="shape-toolbar"
          style={{
            left: shapeToolbarPos.x,
            top: shapeToolbarPos.y - 30,
          }}
        >
          <button onClick={confirmRoom}>✓</button>
          <button onClick={cancelRoom}>✕</button>
        </div>
      )}

      {/* Walls */}
      <div className="walls-layer">
        {walls.map((w) => {
          const rect = gridToScreenRect(w.x1, w.y1, w.x2, w.y2);
          return (
            <div
              key={w.id}
              className="wall"
              style={{
                left: rect.left,
                top: rect.top,
                width: rect.width || 2 * zoom,
                height: rect.height || 2 * zoom,
              }}
            />
          );
        })}

        {/* Draft wall */}
        {draftWall && (
          <div
            className="wall draft-wall"
            style={gridToScreenRect(
              draftWall.x1,
              draftWall.y1,
              draftWall.x2,
              draftWall.y2
            )}
          />
        )}
      </div>

      {/* Doors */}
      <div className="doors-layer">
        {doors.map((d) => {
          const wall = walls.find((w) => w.id === d.wallId);
          if (!wall) return null;
          const rect = computeOpeningRect(wall, d.segStart, d.segEnd, 12);
          if (!rect) return null;
          return (
            <div
              key={d.id}
              className="door"
              style={{
                left: rect.cx,
                top: rect.cy,
                width: rect.width,
                height: rect.height,
              }}
            />
          );
        })}

        {/* Draft door */}
        {draftDoor && (() => {
          const wall = walls.find((w) => w.id === draftDoor.wallId);
          if (!wall) return null;
          const rect = computeOpeningRect(
            wall,
            draftDoor.segStart,
            draftDoor.segEnd,
            12
          );
          if (!rect) return null;
          return (
            <div
              className="door draft-door"
              style={{
                left: rect.cx,
                top: rect.cy,
                width: rect.width,
                height: rect.height,
              }}
            />
          );
        })()}
      </div>

      {/* Windows */}
      <div className="windows-layer">
        {windows.map((wOpen) => {
          const wall = walls.find((w) => w.id === wOpen.wallId);
          if (!wall) return null;
          const rect = computeOpeningRect(
            wall,
            wOpen.segStart,
            wOpen.segEnd,
            8
          );
          if (!rect) return null;
          return (
            <div
              key={wOpen.id}
              className="window-opening"
              style={{
                left: rect.cx,
                top: rect.cy,
                width: rect.width,
                height: rect.height,
              }}
            />
          );
        })}

        {/* Draft window */}
        {draftWindow && (() => {
          const wall = walls.find((w) => w.id === draftWindow.wallId);
          if (!wall) return null;
          const rect = computeOpeningRect(
            wall,
            draftWindow.segStart,
            draftWindow.segEnd,
            8
          );
          if (!rect) return null;
          return (
            <div
              className="window-opening draft-window"
              style={{
                left: rect.cx,
                top: rect.cy,
                width: rect.width,
                height: rect.height,
              }}
            />
          );
        })()}
      </div>

      {/* Hover cell */}
      {hoverStyle && <div className="hover-cell" style={hoverStyle} />}
    </div>
  );
};

export default Canvas;

