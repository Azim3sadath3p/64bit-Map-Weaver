export interface Terrain {
  id: string;
  name: string;
  color: string; // Tailwind CSS class
  hexColor: string; // Actual hex color for canvas drawing
  icon: JSX.Element;
}

// New types for vector drawing
export interface VectorPoint {
  x: number;
  y: number;
}

export interface VectorShape {
  id: string;
  type: 'shape';
  terrainId: string;
  points: VectorPoint[];
}

export interface VectorLine {
  id: string;
  type: 'line';
  terrainId: string;
  points: VectorPoint[];
  width: number;
}

export type VectorObject = VectorShape | VectorLine;

export interface ModalImageData {
  image: string;
  blueprint: string | null;
  leakMap: string | null;
  aiChangeMap: string | null;
}

export type MapStyle = 'photorealistic' | 'pixel';
export type WaterDrawMode = 'blob' | 'path';

export interface AnalysisRecord {
  revision: number;
  mapImage: string;
  aiChangeMap: string | null;
  leakMap: string;
  passed: boolean;
  isFinal: boolean;
  finalReason: 'passed' | 'limit_reached' | null;
  isManual?: boolean;
}