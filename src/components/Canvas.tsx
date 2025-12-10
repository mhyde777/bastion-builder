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
import { useTheme } from "../theme";

interface CanvasProps {
  geometry: FloorGeometry;
  underlayGeometry?: FloorGeometry;
  camera: CameraState;
  setCamera: (cam: CameraState) => void;
  currentTool: Tool;
  onCommitGeometry: (newGeom: FloorGeometry) => void;
  onSelectRoom?: (roomId: string | null) => void;
}

type MouseButton = 0 | 1 | 2;

interface OpeningDraft {
  wall: Wall;
  tStart: number;
  tCurrent: number;
}

// Palette used by all layers based on theme
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

  // light theme
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

export const Canvas: React.FC<CanvasProps> = ({
  geometry,
  underlayGeometry,
  camera,
  setCamera,
  currentTool,
  onCommitGeometry,
  onSelectRoom,
}) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { theme } = useTheme();
  const palette = getCanvasPalette(theme);

  // theme-driven background for the grid area
  const canvasBackground =
    theme === "dark"
      ? "#101010"
      : theme === "blueprint"
      ? "#00152e"
      : "#f4f4f8";

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

  // For Ctrl/Cmd+Z from inside canvas (noop for now)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === "z"
      ) {
        e.preventDefault();
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

  function handleMouseDown(e: React.MouseEvent) {
    e.preventDefault();

    const target = e.target as HTMLElement;
    if (target.closest(".selection-toolbar")) {
      return;
    }

    const button = e.button as MouseButton;

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

    if (currentTool === Tool.Room && button === 0) {
      const existing = findRoomAtGrid(
        cell.x,
        cell.y,
        geometry.rooms
      );
      if (existing) {
        onSelectRoom?.(existing.id);
        return;
      }
    }

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
    }
  }

  function handleMouseMove(e: React.MouseEvent) {
    const rect = getRootRect();
    const cell = screenToGrid(
      e.clientX,
      e.clientY,
      rect,
      camera,
      GRID_SIZE
    );
    setHoverCell(cell);

    if (isPanning && panLast) {
      const dx = e.clientX - panLast.x;
      const dy = e.clientY - panLast.y;
      setPanLast({ x: e.clientX, y: e.clientY });
      setCamera(panCamera(camera, dx, dy));
      return;
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

    if (
      currentTool === Tool.Erase &&
      e.buttons & 1
    ) {
      handleEraseAtPoint(e.clientX, e.clientY);
    }
  }

  function handleMouseUp(e: React.MouseEvent) {
    const button = e.button as MouseButton;

    if (
      isPanning &&
      (button === 0 || button === 1 || button === 2)
    ) {
      endPan();
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
      const wall = finalizeWallDraft(wallStartCell, cell);
      setWallStartCell(null);
      setWallCurrentCell(null);
      if (wall) {
        const newGeom: FloorGeometry = {
          ...geometry,
          walls: [
            ...geometry.walls,
            { ...wall, id: makeId("wall") },
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

    if (isPanning) {
      endPan();
    }
  }

function finalizeWallDraft(
  start: GridPoint,
  end: GridPoint
): Wall | null {
  const x1 = start.x;
  const y1 = start.y;
  const x2 = end.x;
  const y2 = end.y;

  // Ignore zero-length walls
  if (x1 === x2 && y1 === y2) {
    return null;
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
      {/* Grid */}
      <GridLayer camera={camera} palette={palette} />

      {/* Underlay geometry */}
      {underlayGeometry && (
        <GeometryLayer
          geometry={underlayGeometry}
          camera={camera}
          palette={palette}
          dimmed
        />
      )}

      {/* Main geometry */}
      <GeometryLayer
        geometry={geometry}
        camera={camera}
        palette={palette}
      />

      {/* Draft room selection */}
      <DraftSelectionLayer
        selectedCells={selectedCells}
        dragStartCell={dragStartCell}
        dragCurrentCell={dragCurrentCell}
        camera={camera}
        palette={palette}
      />

      {/* Draft wall */}
      <DraftWallLayer
        start={wallStartCell}
        current={wallCurrentCell}
        camera={camera}
        palette={palette}
      />

      {/* Draft door/window */}
      <DraftOpeningLayer
        opening={openingDraft}
        camera={camera}
        palette={palette}
      />

      {/* Hover cell */}
      <HoverCellLayer
        hoverCell={hoverCell}
        camera={camera}
        palette={palette}
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
          onMouseDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
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
  palette: CanvasPalette;
  dimmed?: boolean;
}> = ({ geometry, camera, palette, dimmed }) => {
  const baseWallColor = dimmed
    ? palette.wallDimmed
    : palette.wall;
  const baseRoomFill = dimmed
    ? palette.roomFillDimmed
    : palette.roomFill;

  return (
    <div className="geometry-layer">
      {/* Rooms */}
      {geometry.rooms.map(room => {
        const fillColor = room.color ?? baseRoomFill;

        if (room.cellKeys && room.cellKeys.length > 0) {
          return (
            <React.Fragment key={room.id}>
              {room.cellKeys.map(key => {
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
                      backgroundColor: fillColor,
                      boxSizing: "border-box",
                      pointerEvents: "none",
                    }}
                  />
                );
              })}

              {room.name && (() => {
                const xs: number[] = [];
                const ys: number[] = [];
                room.cellKeys!.forEach(key => {
                  const { x, y } = parseCellKey(key);
                  xs.push(x);
                  ys.push(y);
                });
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
                    {room.name}
                  </div>
                );
              })()}
            </React.Fragment>
          );
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
              backgroundColor: fillColor,
              border: `1px solid ${baseWallColor}`,
              boxSizing: "border-box",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "flex-start",
              pointerEvents: "none",
            }}
          >
            {room.name && (
              <div
                style={{
                  pointerEvents: "none",
                  fontSize: 11,
                  padding: 2,
                  opacity: 0.9,
                  whiteSpace: "nowrap",
                }}
              >
                {room.name}
              </div>
            )}
          </div>
        );
      })}

      {/* Walls */}
      {geometry.walls.map(wall => {
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
              backgroundColor: palette.door,
              transformOrigin: "0 50%",
              transform: `rotate(${rect.angleDeg}deg)`,
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
              backgroundColor: palette.window,
              transformOrigin: "0 50%",
              transform: `rotate(${rect.angleDeg}deg)`,
            }}
          />
        );
      })}
    </div>
  );
};

function wallToScreenSegment(
  wall: Wall,
  camera: CameraState
): {
  left: number;
  top: number;
  width: number;
  height: number;
  angleDeg: number;
} {
  const thickness = (GRID_SIZE * camera.zoom) / 6;

  const x1Screen =
    camera.offset.x + wall.x1 * GRID_SIZE * camera.zoom;
  const y1Screen =
    camera.offset.y + wall.y1 * GRID_SIZE * camera.zoom;
  const x2Screen =
    camera.offset.x + wall.x2 * GRID_SIZE * camera.zoom;
  const y2Screen =
    camera.offset.y + wall.y2 * GRID_SIZE * camera.zoom;

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
}> = ({
  selectedCells,
  dragStartCell,
  dragCurrentCell,
  camera,
  palette,
}) => {
  const items: React.ReactNode[] = [];

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
          backgroundColor: palette.selectionSolid,
        }}
      />
    );
  });

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
            backgroundColor: palette.selectionPreview,
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
  palette: CanvasPalette;
}> = ({ start, current, camera, palette }) => {
  if (!start || !current) return null;

  if (start.x === current.x && start.y === current.y) {
    return null;
  }

  const wall: Wall = {
    id: "",
    x1: start.x,
    y1: start.y,
    x2: current.x,
    y2: current.y,
  };

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
        backgroundColor: palette.draftOpening,
        transformOrigin: "0 50%",
        transform: `rotate(${rect.angleDeg}deg)`,
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

