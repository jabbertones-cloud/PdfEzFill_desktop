import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, AlertTriangle } from "lucide-react";
import type { FormField } from "@shared/schema";

interface ColumnMapping {
  sourceColumn: string;
  fieldLabel: string;
  confidence: number;
}

interface Props {
  mappings: ColumnMapping[];
  onMappingsChange: (mappings: ColumnMapping[]) => void;
  formFields: FormField[];
}

export function BatchColumnMapper({
  mappings,
  onMappingsChange,
  formFields,
}: Props) {
  const [expandedColumn, setExpandedColumn] = useState<string | null>(null);

  const unmappedCount = mappings.filter((m) => !m.fieldLabel).length;
  const fullyMapped = unmappedCount === 0;

  const handleMappingChange = (sourceColumn: string, fieldLabel: string) => {
    const updated = mappings.map((m) =>
      m.sourceColumn === sourceColumn
        ? { ...m, fieldLabel, confidence: fieldLabel ? 0.5 : 0 }
        : m
    );
    onMappingsChange(updated);
  };

  const handleClearMapping = (sourceColumn: string) => {
    const updated = mappings.map((m) =>
      m.sourceColumn === sourceColumn
        ? { ...m, fieldLabel: "", confidence: 0 }
        : m
    );
    onMappingsChange(updated);
  };

  const confidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200";
    if (confidence >= 0.6) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200";
    return "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200";
  };

  const fieldLabels = formFields.map((f) => f.label);
  const usedFields = new Set(mappings.filter((m) => m.fieldLabel).map((m) => m.fieldLabel));

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
        <div className="flex-1">
          <p className="text-sm font-medium">
            {fullyMapped ? (
              <span className="text-green-700 dark:text-green-400 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                All columns mapped
              </span>
            ) : (
              <span className="text-orange-700 dark:text-orange-400 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                {unmappedCount} column{unmappedCount !== 1 ? "s" : ""} unmapped
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {mappings.length} total columns, {formFields.length} form fields
          </p>
        </div>
        {fullyMapped && (
          <Badge variant="default">Ready to generate</Badge>
        )}
      </div>

      {/* Column mapping list */}
      <div className="space-y-3">
        {mappings.map((mapping) => {
          const isMapped = !!mapping.fieldLabel;
          const isExpanded = expandedColumn === mapping.sourceColumn;

          return (
            <Card
              key={mapping.sourceColumn}
              className={`overflow-hidden transition-all ${
                isExpanded ? "ring-2 ring-primary" : ""
              } ${isMapped ? "border-green-200 dark:border-green-800" : "border-yellow-200 dark:border-yellow-800"}`}
            >
              <CardContent className="p-4">
                <div
                  className="flex items-center justify-between gap-4 cursor-pointer"
                  onClick={() =>
                    setExpandedColumn(isExpanded ? null : mapping.sourceColumn)
                  }
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0">
                        {isMapped ? (
                          <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                        ) : (
                          <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {mapping.sourceColumn}
                        </p>
                        {isMapped && (
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-sm text-muted-foreground truncate">
                              Maps to: <strong>{mapping.fieldLabel}</strong>
                            </p>
                            {mapping.confidence > 0 && (
                              <Badge
                                variant="outline"
                                className={`text-xs ${confidenceColor(mapping.confidence)}`}
                              >
                                {Math.round(mapping.confidence * 100)}%
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {isMapped && (
                    <Badge
                      variant="secondary"
                      className="flex-shrink-0"
                    >
                      Mapped
                    </Badge>
                  )}
                </div>

                {/* Expanded mapping selector */}
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t space-y-3">
                    <p className="text-sm font-medium">
                      Select form field to map to:
                    </p>
                    <Select
                      value={mapping.fieldLabel}
                      onValueChange={(value) =>
                        handleMappingChange(mapping.sourceColumn, value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a field..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">
                          <span className="text-muted-foreground">
                            (unmapped)
                          </span>
                        </SelectItem>
                        {fieldLabels.map((label) => (
                          <SelectItem
                            key={label}
                            value={label}
                            disabled={usedFields.has(label) && mapping.fieldLabel !== label}
                          >
                            {label}
                            {usedFields.has(label) && mapping.fieldLabel !== label && (
                              <span className="text-xs text-muted-foreground ml-2">
                                (used)
                              </span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <div className="flex gap-2">
                      {isMapped && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleClearMapping(mapping.sourceColumn)}
                        >
                          Clear Mapping
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandedColumn(null)}
                        className="ml-auto"
                      >
                        Done
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Info box for unmapped columns */}
      {!fullyMapped && (
        <div className="p-4 bg-amber-50 dark:bg-amber-950 rounded-lg border border-amber-200 dark:border-amber-800">
          <p className="text-sm text-amber-900 dark:text-amber-50">
            <strong>Note:</strong> Unmapped columns will be skipped during batch generation. You can ignore them if they're not needed.
          </p>
        </div>
      )}
    </div>
  );
}
