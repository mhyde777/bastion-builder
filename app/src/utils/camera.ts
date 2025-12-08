// src/utils/camera.ts

export type Point = { x: number; y: number };

export interface CameraState {
  offset: Point;
  zoom: number;
}

/**
 * Convert screen-space mouse coordinates to grid coordinates.
 *
 * clientX/clientY: mouse event coordinates
 * rootRect: bounding rect of the canvas root (from getBoundingClientRect())
 * camera: current camera offset + zoom
 * gridSize: base grid size in pixels (e.g. GRID_SIZE)
 */
export function screenToGrid(
  clientX: number,
  clientY: number,
  rootRect: DOMRect | null,
  camera: CameraState,
  gridSize: number
): Point {
  const { offset, zoom } = camera;
  const localX = rootRect ? clientX - rootRect.left : clientX;
  const localY = rootRect ? clientY - rootRect.top : clientY;
  const cellSize = gridSize * zoom;

  const gx = Math.floor((localX - offset.x) / cellSize);
  const gy = Math.floor((localY - offset.y) / cellSize);

  return { x: gx, y: gy };
}

/**
 * Convert a grid-space rectangle [x1,y1]→[x2,y2] to screen-space rect.
 *
 * Returns { left, top, width, height } in pixels.
 */
export function gridToScreenRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  camera: CameraState,
  gridSize: number
): { left: number; top: number; width: number; height: number } {
  const { offset, zoom } = camera;
  const cellSize = gridSize * zoom;

  const left = Math.min(x1, x2) * cellSize + offset.x;
  const top = Math.min(y1, y2) * cellSize + offset.y;
  const width = Math.abs(x2 - x1) * cellSize || 2 * zoom;
  const height = Math.abs(y2 - y1) * cellSize || 2 * zoom;

  return { left, top, width, height };
}

/**
 * Compute a new camera state in response to a wheel event (zoom around a point).
 *
 * prev: previous camera state
 * wheelDeltaY: event.deltaY
 * clientX/clientY: mouse position
 * rootRect: bounding rect of the canvas root
 * options: { minZoom, maxZoom, zoomStep }
 */
export function zoomCameraOnWheel(
  prev: CameraState,
  wheelDeltaY: number,
  clientX: number,
  clientY: number,
  rootRect: DOMRect,
  options?: { minZoom?: number; maxZoom?: number; zoomStep?: number }
): CameraState {
  const { offset, zoom } = prev;
  const minZoom = options?.minZoom ?? 0.25;
  const maxZoom = options?.maxZoom ?? 4;
  const step = options?.zoomStep ?? 0.1;

  const sign = wheelDeltaY > 0 ? -1 : 1;
  const factor = 1 + sign * step;
  const newZoom = Math.min(maxZoom, Math.max(minZoom, zoom * factor));

  const localX = clientX - rootRect.left;
  const localY = clientY - rootRect.top;

  const worldXBefore = (localX - offset.x) / zoom;
  const worldYBefore = (localY - offset.y) / zoom;

  const newOffsetX = localX - worldXBefore * newZoom;
  const newOffsetY = localY - worldYBefore * newZoom;

  return {
    offset: { x: newOffsetX, y: newOffsetY },
    zoom: newZoom,
  };
}

/**
 * Apply a pan delta in screen space to the camera.
 *
 * dx/dy: delta in pixels (screen space)
 */
export function panCamera(
  prev: CameraState,
  dx: number,
  dy: number
): CameraState {
  return {
    offset: {
      x: prev.offset.x + dx,
      y: prev.offset.y + dy,
    },
    zoom: prev.zoom,
  };
}

