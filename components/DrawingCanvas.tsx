import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Terrain, VectorObject, VectorPoint, WaterDrawMode } from '../types';
import { TERRAIN_MAP } from '../constants';
import { Tool } from './Toolbar';
import { getConvexHull } from '../utils/convexHull';
import { pointInPolygon, simplifyPath, isPointNearPolyline } from '../utils/vectorUtils';

interface DrawingCanvasProps {
  vectorObjects: VectorObject[];
  selectedTerrain: Terrain | null;
  brushSize: number;
  onShapeDrawEnd: (points: VectorPoint[]) => void;
  onLineDrawEnd: (points: VectorPoint[], width: number) => void;
  onObjectUpdate: (object: VectorObject) => void;
  currentTool: Tool;
  selectedShapeId: string | null;
  onSelectShape: (id: string | null) => void;
  waterDrawMode: WaterDrawMode;
}

const pointsToString = (points: VectorPoint[]) => {
  return points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
};

const DrawingCanvas: React.FC<DrawingCanvasProps> = ({
  vectorObjects,
  selectedTerrain,
  brushSize,
  onShapeDrawEnd,
  onLineDrawEnd,
  onObjectUpdate,
  currentTool,
  selectedShapeId,
  onSelectShape,
  waterDrawMode,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const paintCanvasRef = useRef<HTMLCanvasElement>(null);

  const [isPainting, setIsPainting] = useState<boolean>(false);
  const [paintedPixels, setPaintedPixels] = useState<VectorPoint[]>([]);
  
  const [draggedPointInfo, setDraggedPointInfo] = useState<{
    objectId: string;
    pointIndex: number;
  } | null>(null);

  const getCoordinates = useCallback((event: React.MouseEvent | MouseEvent): VectorPoint | null => {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }, []);

  const drawOnPaintCanvas = (point: VectorPoint) => {
    const canvas = paintCanvasRef.current;
    if (!canvas || !selectedTerrain) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = selectedTerrain.hexColor;
    ctx.beginPath();
    ctx.arc(point.x, point.y, brushSize / 2, 0, 2 * Math.PI);
    ctx.fill();
  };
  
  const handleMouseDown = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    const coords = getCoordinates(event);
    if (!coords) return;

    if (currentTool === 'brush' && selectedTerrain) {
      setIsPainting(true);
      setPaintedPixels([coords]);
      drawOnPaintCanvas(coords);
    } else if (currentTool === 'edit') {
      const clickedObject = vectorObjects.slice().reverse().find(obj => {
        if (obj.type === 'shape') {
          return pointInPolygon(coords, obj.points);
        }
        if (obj.type === 'line') {
          // Use a tolerance based on line width for easier selection
          return isPointNearPolyline(coords, obj.points, obj.width / 2 + 5);
        }
        return false;
      });

      if (clickedObject) {
        onSelectShape(clickedObject.id);
      } else {
        onSelectShape(null);
      }
    }
  }, [currentTool, getCoordinates, selectedTerrain, onSelectShape, vectorObjects]);

  const handleMouseMove = useCallback((event: MouseEvent) => {
    const coords = getCoordinates(event);
    if (!coords) return;

    if (currentTool === 'brush' && isPainting) {
      setPaintedPixels(prev => [...prev, coords]);
      drawOnPaintCanvas(coords);
    } else if (currentTool === 'edit' && draggedPointInfo) {
      const { objectId, pointIndex } = draggedPointInfo;
      const objectToUpdate = vectorObjects.find(obj => obj.id === objectId);
      if (objectToUpdate) {
        const newPoints = [...objectToUpdate.points];
        newPoints[pointIndex] = coords;
        onObjectUpdate({ ...objectToUpdate, points: newPoints });
      }
    }
  }, [currentTool, isPainting, getCoordinates, onObjectUpdate, draggedPointInfo, vectorObjects]);

  const handleMouseUp = useCallback(() => {
    if (currentTool === 'brush' && isPainting) {
      setIsPainting(false);
      
      if (paintedPixels.length > 5) { // Threshold for creating a shape/line
        const isPathDrawing = selectedTerrain?.id === 'road' || (selectedTerrain?.id === 'water' && waterDrawMode === 'path');
        
        if (isPathDrawing) {
          // Simplify path for lines, epsilon can be tuned.
          const simplifiedLine = simplifyPath(paintedPixels, 5.0);
          onLineDrawEnd(simplifiedLine, brushSize);
        } else {
          const hull = getConvexHull(paintedPixels);
          onShapeDrawEnd(hull);
        }
      }
      
      setPaintedPixels([]);
      const canvas = paintCanvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    } else if (currentTool === 'edit' && draggedPointInfo) {
      setDraggedPointInfo(null);
    }
  }, [currentTool, isPainting, paintedPixels, onShapeDrawEnd, onLineDrawEnd, draggedPointInfo, selectedTerrain, brushSize, waterDrawMode]);

  // Global listeners for mouse move and up to handle dragging outside the canvas
  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // Resize observer for the paint canvas
  useEffect(() => {
    const container = containerRef.current;
    const canvas = paintCanvasRef.current;
    if (!container || !canvas) return;

    const resizeObserver = new ResizeObserver(entries => {
        const entry = entries[0];
        const { width, height } = entry.contentRect;
        canvas.width = width;
        canvas.height = height;
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  const getCursor = () => {
    switch (currentTool) {
        case 'brush': return 'crosshair';
        case 'edit': return draggedPointInfo ? 'grabbing' : 'default';
        default: return 'default';
    }
  };

  return (
    <div ref={containerRef} className="w-full h-full relative" style={{ cursor: getCursor() }}>
      <canvas ref={paintCanvasRef} className="absolute top-0 left-0 w-full h-full pointer-events-none" />
      <svg
        ref={svgRef}
        className="w-full h-full relative"
        onMouseDown={handleMouseDown}
      >
        {/* Render completed vector objects */}
        {vectorObjects.map(obj => {
          const terrain = TERRAIN_MAP[obj.terrainId];
          if (!terrain) return null;

          const isSelected = obj.id === selectedShapeId;

          if (obj.type === 'shape') {
            return (
              <polygon
                key={obj.id}
                points={pointsToString(obj.points)}
                fill={terrain.hexColor}
                stroke={isSelected ? '#fde047' : 'none'}
                strokeWidth="2"
                strokeOpacity="0.8"
                className="cursor-pointer"
              />
            );
          }
          if (obj.type === 'line') {
             return (
              <polyline
                key={obj.id}
                points={pointsToString(obj.points)}
                stroke={terrain.hexColor}
                strokeWidth={obj.width}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="cursor-pointer"
              />
            );
          }
          return null;
        })}

        {/* Render edit handles for selected shape */}
        {currentTool === 'edit' && selectedShapeId &&
          vectorObjects.find(obj => obj.id === selectedShapeId)?.points.map((point, index) => (
            <circle
              key={`${selectedShapeId}-point-${index}`}
              cx={point.x}
              cy={point.y}
              r="6"
              fill="#fde047"
              stroke="#111827"
              strokeWidth="2"
              className="cursor-grab hover:opacity-80 active:cursor-grabbing"
              onMouseDown={(e) => {
                e.stopPropagation();
                setDraggedPointInfo({ objectId: selectedShapeId, pointIndex: index });
              }}
            />
          ))
        }
      </svg>
    </div>
  );
};

export default DrawingCanvas;