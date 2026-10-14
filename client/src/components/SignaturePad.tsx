import { useRef, useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Eraser, Check, Undo2, PenLine } from "lucide-react";

interface SignaturePadProps {
  onSignatureChange: (signatureData: string | null) => void;
  initialSignature?: string | null;
  className?: string;
  strokeColor?: string;
  strokeWidth?: number;
  required?: boolean;
}

interface Point {
  x: number;
  y: number;
  pressure?: number;
}

interface Stroke {
  points: Point[];
}

export function SignaturePad({ 
  onSignatureChange, 
  initialSignature, 
  className,
  strokeColor,
  strokeWidth = 2.5,
  required = false,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Point[]>([]);
  const lastPointRef = useRef<Point | null>(null);

  const getResolvedStrokeColor = useCallback(() => {
    if (strokeColor) return strokeColor;
    if (typeof document !== 'undefined') {
      const style = getComputedStyle(document.documentElement);
      const fg = style.getPropertyValue('--foreground').trim();
      return fg ? `hsl(${fg})` : '#000000';
    }
    return '#000000';
  }, [strokeColor]);

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const color = getResolvedStrokeColor();
    ctx.strokeStyle = color;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    
    const allStrokes = [...strokes, { points: currentStroke }];
    
    for (const stroke of allStrokes) {
      if (stroke.points.length === 0) continue;
      
      const firstPoint = stroke.points[0];
      
      if (stroke.points.length === 1) {
        ctx.beginPath();
        const pressure = firstPoint.pressure ?? 0.5;
        const radius = (strokeWidth * (0.5 + pressure)) / 2;
        ctx.arc(firstPoint.x, firstPoint.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      } else if (stroke.points.length === 2) {
        ctx.beginPath();
        const pressure = ((stroke.points[0]?.pressure ?? 0.5) + (stroke.points[1]?.pressure ?? 0.5)) / 2;
        ctx.lineWidth = strokeWidth * (0.5 + pressure);
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        ctx.lineTo(stroke.points[1].x, stroke.points[1].y);
        ctx.stroke();
      } else {
        for (let i = 0; i < stroke.points.length - 1; i++) {
          const p0 = stroke.points[i];
          const p1 = stroke.points[i + 1];
          
          const avgPressure = ((p0.pressure ?? 0.5) + (p1.pressure ?? 0.5)) / 2;
          ctx.lineWidth = strokeWidth * (0.5 + avgPressure);
          
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          
          if (i < stroke.points.length - 2) {
            const p2 = stroke.points[i + 2];
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            ctx.quadraticCurveTo(p1.x, p1.y, midX, midY);
          } else {
            ctx.lineTo(p1.x, p1.y);
          }
          ctx.stroke();
        }
      }
    }
  }, [strokes, currentStroke, strokeWidth, getResolvedStrokeColor]);

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(dpr, dpr);
    }
    
    redrawCanvas();
  }, [redrawCanvas]);

  useEffect(() => {
    setupCanvas();
    
    const handleResize = () => {
      setupCanvas();
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [setupCanvas]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  useEffect(() => {
    if (initialSignature && strokes.length === 0) {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      
      const img = new Image();
      img.onload = () => {
        const rect = container.getBoundingClientRect();
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
        setHasSignature(true);
      };
      img.src = initialSignature;
    }
  }, [initialSignature, strokes.length]);

  const getCoordinates = useCallback((e: React.MouseEvent | React.TouchEvent): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    
    if ("touches" in e) {
      const touch = e.touches[0];
      if (!touch) return null;
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
        pressure: (touch as any).force ?? 0.5,
      };
    } else {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        pressure: 0.5,
      };
    }
  }, []);

  const startDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const coords = getCoordinates(e);
    if (!coords) return;

    setIsDrawing(true);
    setCurrentStroke([coords]);
    lastPointRef.current = coords;
  }, [getCoordinates]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();

    const coords = getCoordinates(e);
    if (!coords) return;
    
    const lastPoint = lastPointRef.current;
    if (lastPoint) {
      const distance = Math.sqrt(
        Math.pow(coords.x - lastPoint.x, 2) + Math.pow(coords.y - lastPoint.y, 2)
      );
      if (distance < 2) return;
    }

    setCurrentStroke(prev => [...prev, coords]);
    lastPointRef.current = coords;
    setHasSignature(true);
  }, [isDrawing, getCoordinates]);

  const stopDrawing = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);

    if (currentStroke.length > 0) {
      setStrokes(prev => [...prev, { points: currentStroke }]);
      setCurrentStroke([]);
    }
    
    lastPointRef.current = null;

    const canvas = canvasRef.current;
    if (canvas && hasSignature) {
      const signatureData = canvas.toDataURL("image/png");
      onSignatureChange(signatureData);
    }
  }, [isDrawing, currentStroke, hasSignature, onSignatureChange]);

  const clearSignature = useCallback(() => {
    setStrokes([]);
    setCurrentStroke([]);
    setHasSignature(false);
    lastPointRef.current = null;
    onSignatureChange(null);
    
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, [onSignatureChange]);

  const undoLastStroke = useCallback(() => {
    if (strokes.length === 0) return;
    
    const newStrokes = strokes.slice(0, -1);
    setStrokes(newStrokes);
    
    if (newStrokes.length === 0) {
      setHasSignature(false);
      onSignatureChange(null);
    } else {
      setTimeout(() => {
        const canvas = canvasRef.current;
        if (canvas) {
          const signatureData = canvas.toDataURL("image/png");
          onSignatureChange(signatureData);
        }
      }, 50);
    }
  }, [strokes, onSignatureChange]);

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium flex items-center gap-2">
          <PenLine className="h-4 w-4" />
          Signature
          {required && <span className="text-destructive">*</span>}
        </label>
        <div className="flex items-center gap-1">
          {strokes.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={undoLastStroke}
              data-testid="button-undo-signature"
            >
              <Undo2 className="h-4 w-4 mr-1" />
              Undo
            </Button>
          )}
          {hasSignature && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearSignature}
              data-testid="button-clear-signature"
            >
              <Eraser className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
        </div>
      </div>
      
      <div 
        ref={containerRef}
        className="relative border-2 border-dashed rounded-lg bg-background overflow-hidden"
      >
        <canvas
          ref={canvasRef}
          className="w-full h-[180px] cursor-crosshair touch-none"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          data-testid="canvas-signature"
        />
        
        {!hasSignature && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-muted-foreground text-sm">Draw your signature here</p>
          </div>
        )}
        
        <div className="absolute bottom-2 left-0 right-0 h-px bg-muted-foreground/30 mx-4" />
      </div>
      
      {hasSignature && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Check className="h-4 w-4 text-primary" />
          <span>Signature captured</span>
        </div>
      )}
    </div>
  );
}
