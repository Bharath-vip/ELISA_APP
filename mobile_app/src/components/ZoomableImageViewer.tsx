import React, { useState, useRef, useEffect } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Move } from 'lucide-react';

interface ZoomableImageViewerProps {
  imageUrl: string;
  alt?: string;
}

export const ZoomableImageViewer: React.FC<ZoomableImageViewerProps> = ({
  imageUrl,
  alt = 'Detection Result',
}) => {
  const [scale, setScale] = useState<number>(1);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastTouchDistRef = useRef<number | null>(null);
  const lastTapRef = useRef<number>(0);

  // Zoom controls
  const handleZoomIn = () => {
    setScale((prev) => Math.min(prev + 0.5, 4));
  };

  const handleZoomOut = () => {
    setScale((prev) => {
      const next = Math.max(prev - 0.5, 1);
      if (next === 1) setPosition({ x: 0, y: 0 });
      return next;
    });
  };

  const handleReset = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  // Double tap to toggle 1x and 2x
  const handleDoubleTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      if (scale > 1) {
        handleReset();
      } else {
        setScale(2);
      }
    }
    lastTapRef.current = now;
  };

  // Mouse drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || scale <= 1) return;
    setPosition({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    handleDoubleTap();
    if (e.touches.length === 1 && scale > 1) {
      setIsDragging(true);
      dragStartRef.current = {
        x: e.touches[0].clientX - position.x,
        y: e.touches[0].clientY - position.y,
      };
    } else if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      lastTouchDistRef.current = dist;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && isDragging && scale > 1) {
      setPosition({
        x: e.touches[0].clientX - dragStartRef.current.x,
        y: e.touches[0].clientY - dragStartRef.current.y,
      });
    } else if (e.touches.length === 2 && lastTouchDistRef.current !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const delta = dist - lastTouchDistRef.current;
      if (Math.abs(delta) > 5) {
        setScale((prev) => Math.min(Math.max(prev + delta * 0.008, 1), 4));
        lastTouchDistRef.current = dist;
      }
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    lastTouchDistRef.current = null;
  };

  // Reset position when image changes
  useEffect(() => {
    handleReset();
  }, [imageUrl]);

  return (
    <div
      ref={containerRef}
      className="relative w-full rounded-2xl bg-slate-950 border border-slate-800/80 overflow-hidden select-none touch-none flex flex-col items-center justify-center min-h-[320px] max-h-[440px]"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Zoomable image container */}
      <div
        className="w-full h-full flex items-center justify-center transition-transform duration-100 ease-out"
        style={{
          transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
          cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
        }}
      >
        <img
          src={imageUrl}
          alt={alt}
          className="max-w-full max-h-[420px] object-contain rounded-xl pointer-events-none"
          draggable={false}
        />
      </div>

      {/* Floating Zoom & Pan Controls */}
      <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 bg-slate-900/85 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-slate-800 shadow-xl">
        {/* Current scale badge */}
        <span className="text-[11px] font-mono font-bold text-sky-400 px-1.5">
          {Math.round(scale * 100)}%
        </span>

        {/* Zoom Out */}
        <button
          onClick={handleZoomOut}
          disabled={scale <= 1}
          className="p-1.5 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 active:scale-95 transition-all"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        {/* Zoom In */}
        <button
          onClick={handleZoomIn}
          disabled={scale >= 4}
          className="p-1.5 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 active:scale-95 transition-all"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        {/* Reset */}
        {scale > 1 && (
          <button
            onClick={handleReset}
            className="p-1.5 rounded-lg bg-slate-800 text-amber-400 hover:bg-slate-700 active:scale-95 transition-all"
            title="Reset Zoom"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Hint helper */}
      <div className="absolute top-2 left-2 z-20 pointer-events-none bg-slate-950/70 backdrop-blur-sm px-2 py-0.5 rounded text-[10px] text-slate-400 font-sans flex items-center gap-1">
        <Move className="w-3 h-3 text-sky-400" />
        <span>{scale > 1 ? 'Drag to pan around' : 'Double tap or + to zoom'}</span>
      </div>
    </div>
  );
};
