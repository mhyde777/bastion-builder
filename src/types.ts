// src/types.ts

export type ID = string;

export const Tool = {
  Room: "room",
  Wall: "wall",
  Door: "door",
  Window: "window",
  Erase: "erase",
  Pan: "pan",
} as const;

export type Tool = (typeof Tool)[keyof typeof Tool];
export interface CameraState {
  offset: { x: number; y: number };
  zoom: number;
}

// Room metadata types

export type RoomCategory = "cramped" | "roomy" | "vast";

// Reserved for future facility metadata
export type FacilityType =
  | "barracks"
  | "armory"
  | "storage"
  | "hall"
  | "other";

export type RoomShape = "grid" | "circle";

export interface RoomSizeInfo {
  cellCount: number;
  category: RoomCategory;
}

export interface Room {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  cellKeys?: string[];

  // New shape metadata
  shape?: RoomShape;   // defaults to "grid" if omitted
  centerX?: number;    // grid-space center (for circle)
  centerY?: number;    // grid-space center
  radius?: number;     // radius in grid cells

  // Existing metadata
  name?: string;
  color?: string;
  category?: RoomCategory;
  facilityType?: FacilityType | null;
}

export interface Wall {
  id: ID;
  x1: number;
  y1: number;
  x2: number;
  y2: number; // horizontal or vertical only
}

export type StairType = "straight" | "spiral";
export type StairDirection = "up" | "down";

export interface Stair {
  id: ID;

  // Plan position in grid space, same as rooms/walls.
  x: number; // origin grid cell (top-left for straight; center for spiral)
  y: number;

  // Size
  width: number;          // in cells
  length: number;         // in cells (for straight stairs)
  type: StairType;
  direction: StairDirection;  // from the owning level’s point of view

  // Vertical linkage
  linkId: ID;        // identifies the stair pair across levels
  targetLevelId: ID; // the other level in this stair pair
}

export interface Door {
  id: ID;
  wallId: ID;
  segStart: number; // inclusive
  segEnd: number;   // exclusive
}

export interface WindowOpening {
  id: ID;
  wallId: ID;
  segStart: number;
  segEnd: number;
}

export interface FloorGeometry {
  rooms: Room[];
  walls: Wall[];
  doors: Door[];
  windows: WindowOpening[];
}

export interface Level {
  id: ID;
  name: string;
  elevation: number; // can be negative for basements
  geometry: FloorGeometry;
}

export interface Project {
  id: string;
  name: string;
  levels: Level[];
  version: number; // shared, bumped by server
}

