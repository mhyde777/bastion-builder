// src/utils/camera.ts
import type { CameraState } from "../types";
import { GRID_SIZE, MIN_ZOOM, MAX_ZOOM } from "../constants";

export function screenToGrid(
  clientX: number,
  clientY: number,
  rootRect: DOMRect,
  camera: CameraState,
  gridSize: number = GRID_SIZE
): { x: number; y: number } {
  const localX = clientX - rootRect.left;
  const localY = clientY - rootRect.top;

  const worldX =
    (localX - camera.offset.x) / (camera.zoom * gridSize);
  const worldY =
    (localY - camera.offset.y) / (camera.zoom * gridSize);

  return {
    x: Math.floor(worldX),
    y: Math.floor(worldY),
  };
}

export function gridToScreenRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  camera: CameraState,
  gridSize: number = GRID_SIZE
): { left: number; top: number; width: number; height: number } {
  // x1,y1 and x2,y2 are in grid coords; x2/y2 can be non-inclusive bounds
  const gx1 = x1 * gridSize * camera.zoom + camera.offset.x;
  const gy1 = y1 * gridSize * camera.zoom + camera.offset.y;
  const gx2 = x2 * gridSize * camera.zoom + camera.offset.x;
  const gy2 = y2 * gridSize * camera.zoom + camera.offset.y;

  const left = Math.min(gx1, gx2);
  const top = Math.min(gy1, gy2);
  const width = Math.abs(gx2 - gx1);
  const height = Math.abs(gy2 - gy1);

  return { left, top, width, height };
}

export function zoomCameraOnWheel(
  camera: CameraState,
  deltaY: number,
  clientX: number,
  clientY: number,
  rootRect: DOMRect,
  limits: { minZoom?: number; maxZoom?: number } = {}
): CameraState {
  const minZoom = limits.minZoom ?? MIN_ZOOM;
  const maxZoom = limits.maxZoom ?? MAX_ZOOM;

  const zoomFactor = deltaY < 0 ? 1.1 : 1 / 1.1;
  const newZoom = clamp(camera.zoom * zoomFactor, minZoom, maxZoom);

  if (newZoom === camera.zoom) return camera;

  const localX = clientX - rootRect.left;
  const localY = clientY - rootRect.top;

  const worldX = (localX - camera.offset.x) / camera.zoom;
  const worldY = (localY - camera.offset.y) / camera.zoom;

  const newOffsetX = localX - worldX * newZoom;
  const newOffsetY = localY - worldY * newZoom;

  return {
    zoom: newZoom,
    offset: { x: newOffsetX, y: newOffsetY },
  };
}

export function panCamera(
  camera: CameraState,
  dx: number,
  dy: number
): CameraState {
  return {
    ...camera,
    offset: {
      x: camera.offset.x + dx,
      y: camera.offset.y + dy,
    },
  };
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

