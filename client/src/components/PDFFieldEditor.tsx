import { useState, useRef, useCallback, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft,
  ChevronRight,
  Move,
  Type,
  CheckSquare,
  Calendar,
  Mail,
  Phone,
  Hash,
  FileSignature,
  AlignLeft,
} from "lucide-react";
import type { FormField } from "@shared/schema";

interface PDFFieldEditorProps {
  formId: string;
  pageCount: number;
  currentPage: number;
  fields: FormField[];
  onFieldPositionChange: (fieldId: string, newX: number, newY: number) => void;
  onPageChange: (page: number) => void;
  onFieldClick?: (field: FormField) => void;
}

const FIELD_TYPE_ICONS: Record<string, typeof Type> = {
  text: Type,
  textarea: AlignLeft,
  checkbox: CheckSquare,
  date: Calendar,
  email: Mail,
  phone: Phone,
  number: Hash,
  signature: FileSignature,
};

export function PDFFieldEditor({
  formId,
  pageCount,
  currentPage,
  fields,
  onFieldPositionChange,
  onPageChange,
  onFieldClick,
}: PDFFieldEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [draggingField, setDraggingField] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const fieldsOnPage = fields.filter((f) => f.page === currentPage);
  const pageImageUrl = `/api/forms/${formId}/page/${currentPage}`;

  useEffect(() => {
    setImageLoaded(false);
    setImageError(false);
  }, [currentPage, formId]);

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    setImageLoaded(true);
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, field: FormField) => {
      e.preventDefault();
      e.stopPropagation();

      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const fieldX = (field.bbox[0] / 100) * rect.width;
      const fieldY = (field.bbox[1] / 100) * rect.height;

      setDraggingField(field.id);
      setDragOffset({
        x: e.clientX - rect.left - fieldX,
        y: e.clientY - rect.top - fieldY,
      });
    },
    []
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!draggingField) return;

      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const field = fields.find((f) => f.id === draggingField);
      if (!field) return;

      let newX = ((e.clientX - rect.left - dragOffset.x) / rect.width) * 100;
      let newY = ((e.clientY - rect.top - dragOffset.y) / rect.height) * 100;

      newX = Math.max(0, Math.min(100 - field.bbox[2], newX));
      newY = Math.max(0, Math.min(100 - field.bbox[3], newY));

      onFieldPositionChange(field.id, newX, newY);
    },
    [draggingField, dragOffset, fields, onFieldPositionChange]
  );

  const handleMouseUp = useCallback(() => {
    setDraggingField(null);
  }, []);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent, field: FormField) => {
      e.stopPropagation();
      const touch = e.touches[0];
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const fieldX = (field.bbox[0] / 100) * rect.width;
      const fieldY = (field.bbox[1] / 100) * rect.height;

      setDraggingField(field.id);
      setDragOffset({
        x: touch.clientX - rect.left - fieldX,
        y: touch.clientY - rect.top - fieldY,
      });
    },
    []
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!draggingField) return;
      e.preventDefault();

      const touch = e.touches[0];
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const field = fields.find((f) => f.id === draggingField);
      if (!field) return;

      let newX = ((touch.clientX - rect.left - dragOffset.x) / rect.width) * 100;
      let newY = ((touch.clientY - rect.top - dragOffset.y) / rect.height) * 100;

      newX = Math.max(0, Math.min(100 - field.bbox[2], newX));
      newY = Math.max(0, Math.min(100 - field.bbox[3], newY));

      onFieldPositionChange(field.id, newX, newY);
    },
    [draggingField, dragOffset, fields, onFieldPositionChange]
  );

  const handleTouchEnd = useCallback(() => {
    setDraggingField(null);
  }, []);

  const getFieldColor = (field: FormField) => {
    if (field.confidence !== undefined) {
      if (field.confidence >= 85) return "border-green-500 bg-green-500/10";
      if (field.confidence >= 70) return "border-yellow-500 bg-yellow-500/10";
      if (field.confidence >= 50) return "border-orange-500 bg-orange-500/10";
      return "border-red-500 bg-red-500/10";
    }
    return "border-primary bg-primary/10";
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between p-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Move className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Visual Field Editor</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            data-testid="button-editor-prev-page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground px-2">
            Page {currentPage} of {pageCount}
          </span>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= pageCount}
            data-testid="button-editor-next-page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="p-4 bg-muted/20">
        <div
          ref={containerRef}
          className="relative mx-auto bg-white shadow-md select-none"
          style={{
            maxWidth: "100%",
            aspectRatio: imageDimensions.width && imageDimensions.height
              ? `${imageDimensions.width} / ${imageDimensions.height}`
              : "8.5 / 11",
          }}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {!imageLoaded && !imageError && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Skeleton className="w-full h-full" />
            </div>
          )}

          {imageError && (
            <div 
              className="absolute inset-0 flex items-center justify-center bg-muted"
              data-testid="error-page-image"
            >
              <p className="text-sm text-muted-foreground">
                Page image not available
              </p>
            </div>
          )}

          <img
            src={pageImageUrl}
            alt={`Page ${currentPage}`}
            className={`w-full h-full object-contain ${imageLoaded ? "opacity-100" : "opacity-0"}`}
            onLoad={handleImageLoad}
            onError={() => setImageError(true)}
            draggable={false}
            data-testid={`image-pdf-page-${currentPage}`}
          />

          {imageLoaded &&
            fieldsOnPage.map((field) => {
              const Icon = FIELD_TYPE_ICONS[field.type] || Type;
              const isBeingDragged = draggingField === field.id;

              return (
                <div
                  key={field.id}
                  className={`absolute border-2 rounded cursor-move transition-shadow ${getFieldColor(field)} ${
                    isBeingDragged ? "shadow-lg ring-2 ring-primary z-50" : "hover:shadow-md z-10"
                  }`}
                  style={{
                    left: `${field.bbox[0]}%`,
                    top: `${field.bbox[1]}%`,
                    width: `${field.bbox[2]}%`,
                    height: `${field.bbox[3]}%`,
                    minWidth: "40px",
                    minHeight: "20px",
                  }}
                  onMouseDown={(e) => handleMouseDown(e, field)}
                  onTouchStart={(e) => handleTouchStart(e, field)}
                  onClick={(e) => {
                    if (!isBeingDragged && onFieldClick) {
                      e.stopPropagation();
                      onFieldClick(field);
                    }
                  }}
                  data-testid={`field-overlay-${field.id}`}
                >
                  <div className="absolute -top-6 left-0 flex items-center gap-1 whitespace-nowrap">
                    <Badge variant="secondary" className="text-xs py-0 px-1.5 gap-1">
                      <Icon className="h-3 w-3" />
                      <span className="max-w-[100px] truncate">{field.label}</span>
                    </Badge>
                  </div>

                  <div className="absolute inset-0 flex items-center justify-center opacity-30">
                    <Move className="h-4 w-4" />
                  </div>
                </div>
              );
            })}
        </div>

        <div className="mt-3 text-xs text-muted-foreground text-center space-y-1">
          <p>Drag fields to adjust their position on the PDF</p>
          <p>Click a field to edit its properties</p>
        </div>

        <div className="mt-3 flex flex-wrap justify-center gap-3 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded border-2 border-green-500 bg-green-500/20" />
            <span>High confidence</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded border-2 border-yellow-500 bg-yellow-500/20" />
            <span>Medium</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded border-2 border-orange-500 bg-orange-500/20" />
            <span>Low</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded border-2 border-red-500 bg-red-500/20" />
            <span>Very low</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
