// src/types/bastion.ts

export const GRID_SIZE = 40;

export type Tool = "pan" | "room" | "wall" | "erase" | "door" | "window";

export interface Room {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Wall {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Door {
  id: string;
  wallId: string;
  segStart: number;
  segEnd: number;
}

export interface WindowOpening {
  id: string;
  wallId: string;
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
  id: string;
  name: string;
  elevation: number;
  geometry: FloorGeometry;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  levels: Level[];
}

