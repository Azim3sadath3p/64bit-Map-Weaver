import React, { useState, useCallback, useRef, useEffect } from 'react';
import { TERRAIN_MAP } from './constants';
import DrawingCanvas from './components/DrawingCanvas';
import TerrainPalette from './components/TerrainPalette';
import ControlPanel from './components/ControlPanel';
import GeneratedMap from './components/GeneratedMap';
import Toolbar, { Tool } from './components/Toolbar';
import { VectorObject, VectorPoint, VectorShape, VectorLine, ModalImageData, MapStyle, AnalysisRecord, WaterDrawMode } from './types';
import ImageModal from './components/ImageModal';
import ApiKeyModal from './components/ApiKeyModal';
import { useMapGeneration } from './hooks/useMapGeneration';
import GenerationLog from './components/GenerationLog';
import { generateRandomObjects } from './utils/randomFill';

const App: React.FC = () => {
  // --- STATE MANAGEMENT ---

  // Drawing & Tool State
  const [vectorObjects, setVectorObjects] = useState<VectorObject[]>([]);
  const [selectedTerrainId, setSelectedTerrainId] = useState<string | null>('grass');
  const [brushSize, setBrushSize] = useState<number>(30);
  const [currentTool, setCurrentTool] = useState<Tool>('brush');
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [waterDrawMode, setWaterDrawMode] = useState<WaterDrawMode>('blob');
  
  // History State
  const [history, setHistory] = useState<VectorObject[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);
  
  // UI & Config State
  const [apiKey, setApiKey] = useState<string>('');
  const [useStudioKey, setUseStudioKey] = useState<boolean>(true);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [isOverlayVisible, setIsOverlayVisible] = useState<boolean>(false);
  const [modalImage, setModalImage] = useState<ModalImageData | null>(null);
  const [mapStyle, setMapStyle] = useState<MapStyle>('photorealistic');
  const [maxRefinements, setMaxRefinements] = useState<number>(2);
  const [showApiKeyModal, setShowApiKeyModal] = useState<boolean>(false);

  // DOM Ref
  const drawingAreaRef = useRef<HTMLDivElement>(null);

  // Custom Hook for Generation Logic & State
  const {
      isLoading,
      loadingMessage,
      error,
      generatedImage,
      blueprintImage,
      analysisHistory,
      generateMap,
      clearGeneration,
      manualRefine,
  } = useMapGeneration();

  // --- API KEY VALIDATION & MODAL ---

  useEffect(() => {
    // Provides instant, non-blocking feedback if the key format looks incorrect.
    const key = apiKey.trim();
    if (!useStudioKey && key.length > 0 && key.length !== 39) {
      setApiKeyError("Key is usually 39 characters. Please check for typos.");
    } else {
      setApiKeyError(null);
    }
  }, [apiKey, useStudioKey]);

  const handleApiKeyFocus = () => {
    if (!localStorage.getItem('apiKeyNoticeShown')) {
      setShowApiKeyModal(true);
    }
  };

  const handleCloseApiKeyModal = () => {
    localStorage.setItem('apiKeyNoticeShown', 'true');
    setShowApiKeyModal(false);
  };
  
  const handleShowApiKeyModal = () => {
    setShowApiKeyModal(true);
  };

  // --- HISTORY & DRAWING LOGIC ---

  const updateHistory = (newObjects: VectorObject[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newObjects);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };
  
  const handleShapeCreated = (points: VectorPoint[]) => {
    if (!selectedTerrainId || points.length < 3) return;
    const newShape: VectorShape = {
      id: Date.now().toString(), type: 'shape', terrainId: selectedTerrainId, points,
    };
    const newVectorObjects = [...vectorObjects, newShape];
    setVectorObjects(newVectorObjects);
    updateHistory(newVectorObjects);
  };

  const handleLineCreated = (points: VectorPoint[], width: number) => {
    if (!selectedTerrainId || points.length < 2) return;
    const newLine: VectorLine = {
      id: Date.now().toString(), type: 'line', terrainId: selectedTerrainId, points, width,
    };
    const newVectorObjects = [...vectorObjects, newLine];
    setVectorObjects(newVectorObjects);
    updateHistory(newVectorObjects);
  };

  const handleVectorObjectUpdated = (updatedObject: VectorObject) => {
    const newVectorObjects = vectorObjects.map(obj => 
      obj.id === updatedObject.id ? updatedObject : obj
    );
    setVectorObjects(newVectorObjects);
    const newHistory = [...history];
    newHistory[historyIndex] = newVectorObjects;
    setHistory(newHistory);
  };

  const handleSetTool = (tool: Tool) => {
    setCurrentTool(tool);
    setSelectedShapeId(null);
  };

  const handleUndo = () => {
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    setVectorObjects(history[newIndex]);
  };

  const handleClear = useCallback(() => {
    setVectorObjects([]);
    updateHistory([]);
    setIsOverlayVisible(false);
    clearGeneration(); // Clear generation state via the hook
    setModalImage(null);
  }, [clearGeneration]);

  const handleMaxRefinementsChange = (newValue: number) => {
    setMaxRefinements(newValue);
  };

  const handleRandomFill = useCallback(() => {
    handleClear();
    setTimeout(() => {
      const drawingArea = drawingAreaRef.current;
      if (!drawingArea) return;
      const { width, height } = drawingArea.getBoundingClientRect();
      const newObjects = generateRandomObjects(width, height);
      setVectorObjects(newObjects);
      updateHistory(newObjects);
    }, 50); // Timeout allows the 'clear' to render first
  }, [handleClear]);
  
  // --- GENERATION & MODAL CLICKS ---

  const rasterizeVectorsToImage = useCallback((): string => {
    const drawingArea = drawingAreaRef.current;
    if (!drawingArea) return '';

    const { width, height } = drawingArea.getBoundingClientRect();
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    ctx.fillStyle = '#111827'; // bg-gray-900
    ctx.fillRect(0, 0, width, height);

    vectorObjects.forEach(obj => {
      const terrain = TERRAIN_MAP[obj.terrainId];
      if (!terrain || obj.points.length === 0) return;
      ctx.beginPath();
      ctx.moveTo(obj.points[0].x, obj.points[0].y);
      for (let i = 1; i < obj.points.length; i++) {
        ctx.lineTo(obj.points[i].x, obj.points[i].y);
      }
      if (obj.type === 'shape') {
        ctx.closePath();
        ctx.fillStyle = terrain.hexColor;
        ctx.fill();
      } else if (obj.type === 'line') {
        ctx.strokeStyle = terrain.hexColor;
        ctx.lineWidth = obj.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
    });
    return canvas.toDataURL('image/png');
  }, [vectorObjects]);

  const handleGenerate = () => {
    const effectiveApiKey = useStudioKey ? (process.env.GEMINI_API_KEY || '') : apiKey;
    generateMap(vectorObjects, rasterizeVectorsToImage, effectiveApiKey, mapStyle, maxRefinements);
  };

  const handleManualRefine = () => {
    const effectiveApiKey = useStudioKey ? (process.env.GEMINI_API_KEY || '') : apiKey;
    manualRefine(effectiveApiKey, mapStyle);
  };
  
  const handleAnalysisImageClick = (logEntry: AnalysisRecord) => {
    setModalImage({ 
        image: logEntry.mapImage, 
        leakMap: logEntry.leakMap, 
        aiChangeMap: logEntry.aiChangeMap,
        blueprint: blueprintImage 
    });
  };

  const selectedTerrain = selectedTerrainId ? TERRAIN_MAP[selectedTerrainId] : null;

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 p-4 sm:p-6 lg:p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-bold text-amber-300 tracking-wider" style={{ fontFamily: 'Georgia, serif' }}>
            D&D Map Weaver
          </h1>
          <p className="mt-2 text-lg text-gray-400">
            Design your world, and let AI bring it to life.
          </p>
          <div className="max-w-lg mx-auto mt-6">
            <div className="relative">
              <svg aria-hidden="true" className="absolute w-5 h-5 text-gray-400 left-3 top-1/2 -translate-y-1/2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002 2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
              </svg>
              <input
                id="apiKeyInput"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                onFocus={handleApiKeyFocus}
                placeholder={useStudioKey ? "Using environment API key" : "Enter your Google Gemini API Key..."}
                disabled={useStudioKey}
                className={`w-full pl-10 pr-10 py-2 border rounded-md text-white focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all placeholder-gray-500 ${
                  apiKeyError ? 'border-red-500/70' : 'border-gray-600'
                } ${useStudioKey ? 'bg-gray-700/50 cursor-not-allowed' : 'bg-gray-800/60'}`}
                aria-label="Gemini API Key"
              />
              <button
                onClick={handleShowApiKeyModal}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-amber-300 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400 rounded-full"
                aria-label="Show API key security information"
                title="Show API key security information"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            <div className="flex items-center justify-start mt-3 space-x-2">
              <input
                id="useStudioKey"
                type="checkbox"
                checked={useStudioKey}
                onChange={(e) => {
                  setUseStudioKey(e.target.checked);
                  if (e.target.checked) {
                    setApiKeyError(null);
                  }
                }}
                className="h-4 w-4 rounded border-gray-500 text-amber-600 bg-gray-700 focus:ring-amber-500 focus:ring-offset-gray-900 cursor-pointer"
              />
              <label htmlFor="useStudioKey" className="text-sm text-gray-400 select-none cursor-pointer">
                Use provided environment key
              </label>
            </div>
             {apiKeyError && <p className="text-xs text-red-400 mt-2">{apiKeyError}</p>}
             <p className={`text-xs text-gray-500 ${apiKeyError ? 'mt-1' : 'mt-2'}`}>
                Your key is used for this session only and is not stored.{' '}
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">
                    Get an API Key from Google AI Studio.
                </a>
            </p>
          </div>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div ref={drawingAreaRef} className="aspect-[16/9] relative p-4 bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg shadow-lg overflow-hidden">
                <DrawingCanvas
                  vectorObjects={vectorObjects}
                  selectedTerrain={selectedTerrain}
                  brushSize={brushSize}
                  onShapeDrawEnd={handleShapeCreated}
                  onLineDrawEnd={handleLineCreated}
                  onObjectUpdate={handleVectorObjectUpdated}
                  currentTool={currentTool}
                  selectedShapeId={selectedShapeId}
                  onSelectShape={setSelectedShapeId}
                  waterDrawMode={waterDrawMode}
                />
            </div>
            <GeneratedMap 
              imageSrc={generatedImage} 
              isLoading={isLoading} 
              loadingMessage={loadingMessage}
              error={error} 
              isOverlayVisible={isOverlayVisible}
              blueprintImage={blueprintImage}
              onImageClick={(image) => setModalImage({ image, leakMap: null, aiChangeMap: null, blueprint: blueprintImage })}
            />
            <GenerationLog
                analysisHistory={analysisHistory}
                onImageClick={handleAnalysisImageClick}
            />
          </div>

          <aside className="lg:col-span-1 space-y-8">
            <TerrainPalette
              selectedTerrainId={selectedTerrainId}
              onSelectTerrain={setSelectedTerrainId}
              waterDrawMode={waterDrawMode}
              onWaterDrawModeChange={setWaterDrawMode}
            />
             <Toolbar
              currentTool={currentTool}
              onSetTool={handleSetTool}
            />
            <ControlPanel
              onGenerate={handleGenerate}
              onClear={handleClear}
              onUndo={handleUndo}
              onRandomFill={handleRandomFill}
              isLoading={isLoading}
              loadingMessage={loadingMessage}
              isApiKeyEntered={!!((useStudioKey && process.env.GEMINI_API_KEY) || apiKey.trim())}
              canUndo={historyIndex > 0}
              brushSize={brushSize}
              onBrushSizeChange={setBrushSize}
              currentTool={currentTool}
              isOverlayVisible={isOverlayVisible}
              onToggleOverlay={() => setIsOverlayVisible(v => !v)}
              isMapGenerated={!!generatedImage}
              mapStyle={mapStyle}
              onMapStyleChange={setMapStyle}
              maxRefinements={maxRefinements}
              onMaxRefinementsChange={handleMaxRefinementsChange}
              onManualRefine={handleManualRefine}
            />
          </aside>
        </main>
      </div>
      {modalImage && (
        <ImageModal 
            imageSrc={modalImage.image}
            blueprintSrc={modalImage.blueprint}
            leakMapSrc={modalImage.leakMap}
            aiChangeMapSrc={modalImage.aiChangeMap}
            alt="Refinement history detail"
            onClose={() => setModalImage(null)} 
        />
      )}
      {showApiKeyModal && (
        <ApiKeyModal 
            isOpen={showApiKeyModal} 
            onClose={handleCloseApiKeyModal} 
        />
      )}
    </div>
  );
};

export default App;