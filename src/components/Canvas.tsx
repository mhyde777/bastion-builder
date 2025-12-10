// src/components/Canvas.tsx
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  CameraState,
  Door,
  FloorGeometry,
  Wall,
  WindowOpening,
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
import { normalizeWall } from "../utils/walls";

interface CanvasProps {
  geometry: FloorGeometry;
  underlayGeometry?: FloorGeometry;
  camera: CameraState;
  setCamera: (cam: CameraState) => void;
  currentTool: Tool;
  onCommitGeometry: (newGeom: FloorGeometry) => void;
}

type MouseButton = 0 | 1 | 2;

interface OpeningDraft {
  wall: Wall;
  tStart: number;
  tCurrent: number;
}

export const Canvas: React.FC<CanvasProps> = ({
  geometry,
  underlayGeometry,
  camera,
  setCamera,
  currentTool,
  onCommitGeometry,
}) => {
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Room tool draft
  const [dragStartCell, setDragStartCell] =
    useState<GridPoint | null>(null);
  const [dragCurrentCell, setDragCurrentCell] =
    useState<GridPoint | null>(null);
  const [selectedCells, setSelectedCells] = useState<
    Set<string>
  >(new Set());

  // Wall tool draft
  const [wallStartCell, setWallStartCell] =
    useState<GridPoint | null>(null);
  const [wallCurrentCell, setWallCurrentCell] =
    useState<GridPoint | null>(null);

  // Door/window draft
  const [openingDraft, setOpeningDraft] =
    useState<OpeningDraft | null>(null);

  // Pan drag
  const [isPanning, setIsPanning] = useState(false);
  const [panLast, setPanLast] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Hover cell
  const [hoverCell, setHoverCell] =
    useState<GridPoint | null>(null);

  // For Ctrl/Cmd+Z from inside canvas
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === "z"
      ) {
        e.preventDefault();
        // parent supplies Undo via ToolPalette; keep here as noop
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () =>
      window.removeEventListener("keydown", onKeyDown);
  }, []);

  const getRootRect = useCallback(() => {
    const el = rootRef.current;
    return el
      ? el.getBoundingClientRect()
      : new DOMRect(0, 0, 1, 1);
  }, []);

  function isOverSelectionToolbar(
    e: React.MouseEvent
  ): boolean {
    const target = e.target as HTMLElement | null;
    if (!target) return false;
    return !!target.closest(".selection-toolbar");
  }

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

  function handleMouseDown(e: React.MouseEvent) {
    if (isOverSelectionToolbar(e)) return;
    e.preventDefault();
    const button = e.button as MouseButton;

    // Middle or right button always pan
    if (button === 1 || button === 2) {
      beginPan(e);
      return;
    }

    const rect = getRootRect();
    const cell = screenToGrid(
      e.clientX,
      e.clientY,
      rect,
      camera,
      GRID_SIZE
    );

    if (currentTool === Tool.Pan && button === 0) {
      beginPan(e);
      return;
    }

    if (currentTool === Tool.Room && button === 0) {
      setDragStartCell(cell);
      setDragCurrentCell(cell);
      return;
    }

    if (currentTool === Tool.Wall && button === 0) {
      setWallStartCell(cell);
      setWallCurrentCell(cell);
      return;
    }

    if (
      (currentTool === Tool.Door ||
        currentTool === Tool.Window) &&
      button === 0
    ) {
      const hit = hitTestWallAtPoint(
        geometry.walls,
        e.clientX,
        e.clientY,
        rect,
        camera
      );
      if (hit) {
        setOpeningDraft({
          wall: hit.wall,
          tStart: hit.t,
          tCurrent: hit.t,
        });
      }
      return;
    }

    if (currentTool === Tool.Erase && button === 0) {
      handleEraseAtPoint(e.clientX, e.clientY);
      // keep erasing on drag
    }
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (isOverSelectionToolbar(e)) return;

    const rect = getRootRect();
    const cell = screenToGrid(
      e.clientX,
      e.clientY,
      rect,
      camera,
      GRID_SIZE
    );
    setHoverCell(cell);

        // Pan
    if (isPanning && panLast) {
      const dx = e.clientX - panLast.x;
      const dy = e.clientY - panLast.y;
      setPanLast({ x: e.clientX, y: e.clientY });
      setCamera(panCamera(camera, dx, dy));
      return;
    }

    // Room drag
    if (dragStartCell) {
      setDragCurrentCell(cell);
      return;
    }

    // Wall drag
    if (wallStartCell) {
      setWallCurrentCell(cell);
      return;
    }

    // Opening drag
    if (openingDraft) {
      const hit = hitTestWallAtPoint(
        [openingDraft.wall],
        e.clientX,
        e.clientY,
        rect,
        camera
      );
      if (hit) {
        setOpeningDraft({
          ...openingDraft,
          tCurrent: hit.t,
        });
      }
    }

    // Erase drag
    if (
      currentTool === Tool.Erase &&
      e.buttons & 1 // left button held
    ) {
      handleEraseAtPoint(e.clientX, e.clientY);
    }
  }

  function handleMouseUp(e: React.MouseEvent) {
    if (isOverSelectionToolbar(e)) return;

    const button = e.button as MouseButton;

    if (
      isPanning &&
      (button === 1 || button === 2 || currentTool === Tool.Pan)
    ) {
      setIsPanning(false);
      setPanLast(null);
      return;
    }

    const rect = getRootRect();
    const cell = screenToGrid(
      e.clientX,
      e.clientY,
      rect,
      camera,
      GRID_SIZE
    );

    if (currentTool === Tool.Room && dragStartCell) {
      const rectCells = rectCellsBetween(
        dragStartCell,
        cell
      );
      setSelectedCells(prev =>
        xorRectIntoSelection(prev, rectCells)
      );
      setDragStartCell(null);
      setDragCurrentCell(null);
    }

    if (currentTool === Tool.Wall && wallStartCell) {
      const wall = finalizeWallDraft(
        wallStartCell,
        cell
      );
      setWallStartCell(null);
      setWallCurrentCell(null);
      if (wall) {
        const normalized = normalizeWall(wall);
        const newGeom: FloorGeometry = {
          ...geometry,
          walls: [
            ...geometry.walls,
            { ...normalized, id: makeId("wall") },
          ],
        };
        onCommitGeometry(newGeom);
      }
    }

    if (
      (currentTool === Tool.Door ||
        currentTool === Tool.Window) &&
      openingDraft
    ) {
      const range = openingSegmentRange(
        openingDraft.wall,
        openingDraft.tStart,
        openingDraft.tCurrent
      );
      if (range) {
        if (currentTool === Tool.Door) {
          const door: Door = {
            id: makeId("door"),
            wallId: openingDraft.wall.id,
            segStart: range.segStart,
            segEnd: range.segEnd,
          };
          onCommitGeometry({
            ...geometry,
            doors: [...geometry.doors, door],
          });
        } else {
          const win: WindowOpening = {
            id: makeId("window"),
            wallId: openingDraft.wall.id,
            segStart: range.segStart,
            segEnd: range.segEnd,
          };
          onCommitGeometry({
            ...geometry,
            windows: [...geometry.windows, win],
          });
        }
      }
      setOpeningDraft(null);
    }
  }

  function handleMouseLeave() {
    setHoverCell(null);
    setDragCurrentCell(null);
  }

  function finalizeWallDraft(
    start: GridPoint,
    end: GridPoint
  ): Wall | null {
    let x1 = start.x;
    let y1 = start.y;
    let x2 = end.x;
    let y2 = end.y;

    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);

    if (dx === 0 && dy === 0) return null;

    if (dx >= dy) {
      // horizontal
      y2 = y1;
    } else {
      // vertical
      x2 = x1;
    }

    return {
      id: "",
      x1,
      y1,
      x2,
      y2,
    };
  }

  function handleEraseAtPoint(
    clientX: number,
    clientY: number
  ) {
    const rect = getRootRect();
    const cell = screenToGrid(
      clientX,
      clientY,
      rect,
      camera,
      GRID_SIZE
    );

    // First try walls in screen space
    const hit = hitTestWallAtPoint(
      geometry.walls,
      clientX,
      clientY,
      rect,
      camera
    );
    if (hit) {
      const newGeom = removeSingleWallAndOpenings(
        hit.wall,
        geometry
      );
      onCommitGeometry(newGeom);
      return;
    }

    // Then rooms
    const room = findRoomAtGrid(
      cell.x,
      cell.y,
      geometry.rooms
    );
    if (room) {
      const wallsToRemove = findWallsAroundRoom(
        room,
        geometry.walls
      );
      let newGeom: FloorGeometry = {
        ...geometry,
        rooms: geometry.rooms.filter(
          r => r.id !== room.id
        ),
      };
      newGeom = removeWallsAndOpenings(
        wallsToRemove,
        newGeom
      );
      onCommitGeometry(newGeom);
    }
  }

  function confirmRoomSelection() {
    if (selectedCells.size === 0) return;
    const room = createRoomFromCellKeys(
      selectedCells,
      makeId("room")
    );
    if (!room) {
      setSelectedCells(new Set());
      return;
    }

    if (hasRoomOverlap(geometry.rooms, room)) {
      // reject, clear draft
      setSelectedCells(new Set());
      return;
    }

    const walls = perimeterWallsFromCellKeys(
      selectedCells,
      () => makeId("wall")
    );
    const newGeom: FloorGeometry = {
      ...geometry,
      rooms: [...geometry.rooms, room],
      walls: [...geometry.walls, ...walls],
    };
    onCommitGeometry(newGeom);
    setSelectedCells(new Set());
  }

  function cancelRoomSelection() {
    setSelectedCells(new Set());
  }

  // Floating confirmation toolbar position
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
    const rect = gridToScreenRect(
      minX,
      minY,
      maxX + 1,
      maxY + 1,
      camera,
      GRID_SIZE
    );
    return {
      left: rect.left + rect.width + 8,
      top: rect.top,
    };
  })();

  // Render
  return (
    <div
      ref={rootRef}
      className="canvas-root"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      {/* Grid */}
      <GridLayer camera={camera} />

      {/* Underlay geometry */}
      {underlayGeometry && (
        <GeometryLayer
          geometry={underlayGeometry}
          camera={camera}
          dimmed
        />
      )}

      {/* Main geometry */}
      <GeometryLayer
        geometry={geometry}
        camera={camera}
      />

      {/* Draft room selection */}
      <DraftSelectionLayer
        selectedCells={selectedCells}
        dragStartCell={dragStartCell}
        dragCurrentCell={dragCurrentCell}
        camera={camera}
      />

      {/* Draft wall */}
      <DraftWallLayer
        start={wallStartCell}
        current={wallCurrentCell}
        camera={camera}
      />

      {/* Draft door/window */}
      <DraftOpeningLayer
        opening={openingDraft}
        camera={camera}
      />

      {/* Hover cell */}
      <HoverCellLayer
        hoverCell={hoverCell}
        camera={camera}
      />

      {/* Confirm/cancel toolbar */}
      {selectionToolbarStyle && (
        <div
          className="selection-toolbar"
          style={{
            position: "absolute",
            left: selectionToolbarStyle.left,
            top: selectionToolbarStyle.top,
          }}
        >
          <button onClick={confirmRoomSelection}>
            ✓
          </button>
          <button onClick={cancelRoomSelection}>
            ✕
          </button>
        </div>
      )}
    </div>
  );
};

// Separate presentational layers for clarity

const GridLayer: React.FC<{
  camera: CameraState;
}> = ({ camera }) => {
  const style: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    backgroundImage: `linear-gradient( to right, rgba(0,0,0,0.1) 1px, transparent 1px ),
                      linear-gradient( to bottom, rgba(0,0,0,0.1) 1px, transparent 1px )`,
    backgroundSize: `${
      GRID_SIZE * camera.zoom
    }px ${GRID_SIZE * camera.zoom}px`,
    backgroundPosition: `${camera.offset.x}px ${camera.offset.y}px`,
    pointerEvents: "none",
  };
  return <div style={style} />;
};

const GeometryLayer: React.FC<{
  geometry: FloorGeometry;
  camera: CameraState;
  dimmed?: boolean;
}> = ({ geometry, camera, dimmed }) => {
  const baseColor = dimmed
    ? "rgba(0,0,0,0.15)"
    : "rgba(0,0,0,0.6)";
  const roomColor = dimmed
    ? "rgba(0,0,150,0.08)"
    : "rgba(0,0,150,0.2)";

  return (
    <div className="geometry-layer">
      {/* Rooms */}
      {geometry.rooms.map(room => {
        // If the room has an explicit cell mask, render each cell;
        // otherwise fall back to the rectangular bounds.
        if (room.cellKeys && room.cellKeys.length > 0) {
          return room.cellKeys.map(key => {
            const { x, y } = parseCellKey(key);
            const rect = gridToScreenRect(
              x,
              y,
              x + 1,
              y + 1,
              camera,
              GRID_SIZE
            );
            return (
              <div
                key={`${room.id}-${key}`}
                style={{
                  position: "absolute",
                  left: rect.left,
                  top: rect.top,
                  width: rect.width,
                  height: rect.height,
                  backgroundColor: roomColor,
                  border: `1px solid ${baseColor}`,
                  boxSizing: "border-box",
                }}
              />
            );
          });
        }

        const rect = gridToScreenRect(
          room.x,
          room.y,
          room.x + room.width,
          room.y + room.height,
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
              backgroundColor: roomColor,
              border: `1px solid ${baseColor}`,
              boxSizing: "border-box",
            }}
          />
        );
      })}

      {/* Walls */}
      {geometry.walls.map(wall => {
        const rect = wallRectToScreen(wall, camera);
        return (
          <div
            key={wall.id}
            style={{
              position: "absolute",
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
              backgroundColor: baseColor,
            }}
          />
        );
      })}

      {/* Doors */}
      {geometry.doors.map(door => {
        const wall = geometry.walls.find(
          w => w.id === door.wallId
        );
        if (!wall) return null;
        const rect = computeOpeningRectOnWall(
          wall,
          door.segStart,
          door.segEnd,
          camera
        );
        return (
          <div
            key={door.id}
            style={{
              position: "absolute",
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
              backgroundColor: "rgba(0,200,0,0.7)",
            }}
          />
        );
      })}

      {/* Windows */}
      {geometry.windows.map(win => {
        const wall = geometry.walls.find(
          w => w.id === win.wallId
        );
        if (!wall) return null;
        const rect = computeOpeningRectOnWall(
          wall,
          win.segStart,
          win.segEnd,
          camera
        );
        return (
          <div
            key={win.id}
            style={{
              position: "absolute",
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
              backgroundColor: "rgba(0,150,200,0.7)",
            }}
          />
        );
      })}
    </div>
  );
};

function wallRectToScreen(
  wall: Wall,
  camera: CameraState
): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  const thickness = (GRID_SIZE * camera.zoom) / 6;
  if (wall.y1 === wall.y2) {
    const base = gridToScreenRect(
      wall.x1,
      wall.y1,
      wall.x2,
      wall.y2,
      camera,
      GRID_SIZE
    );
    return {
      left: base.left,
      top: base.top - thickness / 2,
      width: base.width,
      height: thickness,
    };
  } else {
    const base = gridToScreenRect(
      wall.x1,
      wall.y1,
      wall.x2,
      wall.y2,
      camera,
      GRID_SIZE
    );
    return {
      left: base.left - thickness / 2,
      top: base.top,
      width: thickness,
      height: base.height,
    };
  }
}

const DraftSelectionLayer: React.FC<{
  selectedCells: Set<string>;
  dragStartCell: GridPoint | null;
  dragCurrentCell: GridPoint | null;
  camera: CameraState;
}> = ({
  selectedCells,
  dragStartCell,
  dragCurrentCell,
  camera,
}) => {
  const items: React.ReactNode[] = [];

  // Solid selected cells
  selectedCells.forEach(key => {
    const [x, y] = key.split(",").map(v => parseInt(v, 10));
    const rect = gridToScreenRect(
      x,
      y,
      x + 1,
      y + 1,
      camera,
      GRID_SIZE
    );
    items.push(
      <div
        key={`sel-${key}`}
        style={{
          position: "absolute",
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          backgroundColor: "rgba(50,150,255,0.25)",
        }}
      />
    );
  });

  // Drag preview
  if (dragStartCell && dragCurrentCell) {
    const rectCells = rectCellsBetween(
      dragStartCell,
      dragCurrentCell
    );
    rectCells.forEach((key, i) => {
      const [x, y] = key
        .split(",")
        .map(v => parseInt(v, 10));
      const rect = gridToScreenRect(
        x,
        y,
        x + 1,
        y + 1,
        camera,
        GRID_SIZE
      );
      items.push(
        <div
          key={`preview-${key}-${i}`}
          style={{
            position: "absolute",
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            backgroundColor: "rgba(50,150,255,0.15)",
          }}
        />
      );
    });
  }

  return <>{items}</>;
};

const DraftWallLayer: React.FC<{
  start: GridPoint | null;
  current: GridPoint | null;
  camera: CameraState;
}> = ({ start, current, camera }) => {
  if (!start || !current) return null;
  const draft = (() => {
    let x1 = start.x;
    let y1 = start.y;
    let x2 = current.x;
    let y2 = current.y;
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    if (dx === 0 && dy === 0) return null;
    if (dx >= dy) {
      y2 = y1;
    } else {
      x2 = x1;
    }
    return { x1, y1, x2, y2 };
  })();
  if (!draft) return null;

  const wall: Wall = {
    id: "",
    ...draft,
  };
  const rect = wallRectToScreen(wall, camera);
  return (
    <div
      style={{
        position: "absolute",
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        backgroundColor: "rgba(0,0,0,0.3)",
      }}
    />
  );
};

const DraftOpeningLayer: React.FC<{
  opening: OpeningDraft | null;
  camera: CameraState;
}> = ({ opening, camera }) => {
  if (!opening) return null;
  const range = openingSegmentRange(
    opening.wall,
    opening.tStart,
    opening.tCurrent
  );
  if (!range) return null;
  const rect = computeOpeningRectOnWall(
    opening.wall,
    range.segStart,
    range.segEnd,
    camera
  );
  return (
    <div
      style={{
        position: "absolute",
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        backgroundColor: "rgba(0,255,0,0.4)",
      }}
    />
  );
};

const HoverCellLayer: React.FC<{
  hoverCell: GridPoint | null;
  camera: CameraState;
}> = ({ hoverCell, camera }) => {
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
        border: "1px dashed rgba(0,0,0,0.3)",
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

