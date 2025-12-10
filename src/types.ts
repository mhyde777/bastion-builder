// src/types.ts

export type ID = string;

export enum Tool {
  Room = "room",
  Wall = "wall",
  Door = "door",
  Window = "window",
  Erase = "erase",
  Pan = "pan",
}

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
  // exact drafted shape; keys like "x,y"
  cellKeys?: string[];

  // New metadata
  name?: string;
  /**
   * CSS color / hex string. If omitted, UI should fall back
   * to a default based on category.
   */
  color?: string;
  /**
   * “Cramped / roomy / vast” classification based on cell count.
   */
  category?: RoomCategory;
  /**
   * Reserved for future facility-type assignment.
   */
  facilityType?: FacilityType | null;
}

export interface Wall {
  id: ID;
  x1: number;
  y1: number;
  x2: number;
  y2: number; // horizontal or vertical only
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

