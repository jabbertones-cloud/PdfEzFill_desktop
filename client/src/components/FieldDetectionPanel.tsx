import { useState, useCallback, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  Zap,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { DetectedFieldsList } from "@/components/DetectedFieldsList";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { FormField } from "@shared/schema";

interface FieldDetectionPanelProps {
  formId: string;
  currentPageCount: number;
  onFieldsDetected?: (fields: FormField[]) => void;
  onMergeComplete?: (mergedFields: FormField[]) => void;
  existingFields?: FormField[];
}

type DetectionMethod = "full" | "checkboxes" | "signatures";

interface DetectionStats {
  total: number;
  verified: number;
  rejected: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
}

export function FieldDetectionPanel({
  formId,
  currentPageCount,
  onFieldsDetected,
  onMergeComplete,
  existingFields = [],
}: FieldDetectionPanelProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isExpanded, setIsExpanded] = useState(false);
  const [detectedFields, setDetectedFields] = useState<FormField[]>([]);
  const [detectionMethod, setDetectionMethod] = useState<DetectionMethod>("full");
  const [verifiedFields, setVerifiedFields] = useState<Set<string>>(new Set());
  const [rejectedFields, setRejectedFields] = useState<Set<string>>(new Set());

  // Detect fields mutation
  const detectFieldsMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);

      const endpoint =
        detectionMethod === "full"
          ? "/api/detect/fields"
          : detectionMethod === "checkboxes"
          ? "/api/detect/checkboxes"
          : "/api/detect/signatures";

      const response = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const data = await response.json();
      return data.data || data;
    },
    onSuccess: (data) => {
      const fields = Array.isArray(data.fields) ? data.fields : [data.fields];

      // Convert detected fields to FormField format
      const convertedFields: FormField[] = fields.map((field: any, idx: number) => ({
        id: `detected_${detectionMethod}_${idx}_${Date.now()}`,
        label: field.label || `Detected Field ${idx + 1}`,
        type: mapDetectedFieldType(field.fieldType || field.type),
        page: field.page || 1,
        bbox: field.bbox || [0, 0, 100, 100],
        confidence: field.confidence || 50,
        required: false,
      }));

      setDetectedFields(convertedFields);
      setVerifiedFields(new Set());
      setRejectedFields(new Set());
      setIsExpanded(true);

      onFieldsDetected?.(convertedFields);

      toast({
        title: "Detection complete",
        description: `Detected ${convertedFields.length} field${convertedFields.length !== 1 ? "s" : ""}`,
      });
    },
    onError: (error) => {
      toast({
        title: "Detection failed",
        description: (error as Error).message || "Failed to detect fields",
        variant: "destructive",
      });
    },
  });

  // Verify field mutation
  const verifyFieldMutation = useMutation({
    mutationFn: async (fieldId: string) => {
      return apiRequest("PATCH", `/api/forms/${formId}/detected-fields/${fieldId}/verify`, {
        verified: true,
      });
    },
    onSuccess: () => {
      toast({
        title: "Field verified",
        description: "The field has been marked as verified",
      });
    },
  });

  // Merge fields mutation
  const mergeFieldsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/detect/merge", {
        formId,
        ocrFields: existingFields,
      });
      return response;
    },
    onSuccess: (data) => {
      toast({
        title: "Fields merged",
        description: `Merged ${data.mergedCount || 0} fields`,
      });
      onMergeComplete?.(data.mergedFields || []);
    },
    onError: (error) => {
      toast({
        title: "Merge failed",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (file) {
      if (!file.type.includes("pdf")) {
        toast({
          title: "Invalid file",
          description: "Please upload a PDF file",
          variant: "destructive",
        });
        return;
      }

      detectFieldsMutation.mutate(file);
    }
  };

  const handleVerifyField = useCallback(
    (fieldId: string) => {
      setVerifiedFields((prev) => new Set(prev).add(fieldId));
      setRejectedFields((prev) => {
        const next = new Set(prev);
        next.delete(fieldId);
        return next;
      });
      verifyFieldMutation.mutate(fieldId);
    },
    []
  );

  const handleRejectField = useCallback((fieldId: string) => {
    setRejectedFields((prev) => new Set(prev).add(fieldId));
    setVerifiedFields((prev) => {
      const next = new Set(prev);
      next.delete(fieldId);
      return next;
    });
  }, []);

  const stats = calculateStats(detectedFields, verifiedFields, rejectedFields);

  return (
    <Card>
      <CardHeader
        className="cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Zap className="h-5 w-5 text-amber-500" />
                Auto-Detect Form Fields
              </CardTitle>
            </div>
            <CardDescription className="mt-1">
              Use AI to automatically detect fillable fields, checkboxes, and signature zones in your PDF
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-6 border-t pt-6">
          {/* Detection Method Selector & Controls */}
          {detectedFields.length === 0 ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Detection Method</label>
                <Select value={detectionMethod} onValueChange={(v) => setDetectionMethod(v as DetectionMethod)}>
                  <SelectTrigger disabled={detectFieldsMutation.isPending}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">Full Detection (all field types)</SelectItem>
                    <SelectItem value="checkboxes">Checkboxes Only</SelectItem>
                    <SelectItem value="signatures">Signatures Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Upload Section */}
              <div className="border-2 border-dashed rounded-lg p-6 text-center space-y-3 bg-muted/30 hover:bg-muted/50 transition-colors">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                  disabled={detectFieldsMutation.isPending}
                />

                <div>
                  <p className="font-medium text-sm">Upload PDF for Field Detection</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Upload the original form PDF to auto-detect fields
                  </p>
                </div>

                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={detectFieldsMutation.isPending}
                  size="sm"
                >
                  {detectFieldsMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {detectFieldsMutation.isPending ? "Detecting..." : "Select PDF File"}
                </Button>
              </div>

              {/* Info Box */}
              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg p-3">
                <div className="flex gap-2">
                  <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-blue-900 dark:text-blue-200">
                    <p className="font-medium">Tip:</p>
                    <p>Detection works best on standard form PDFs with clear field boundaries</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            // Results View
            <div className="space-y-6">
              {/* Stats Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Total Detected</p>
                  <p className="text-xl font-bold">{stats.total}</p>
                </div>
                <div className="bg-green-50 dark:bg-green-950/20 rounded-lg p-3 border border-green-200 dark:border-green-900">
                  <p className="text-xs text-green-900 dark:text-green-200">Verified</p>
                  <p className="text-xl font-bold text-green-600 dark:text-green-400">{stats.verified}</p>
                </div>
                <div className="bg-red-50 dark:bg-red-950/20 rounded-lg p-3 border border-red-200 dark:border-red-900">
                  <p className="text-xs text-red-900 dark:text-red-200">Rejected</p>
                  <p className="text-xl font-bold text-red-600 dark:text-red-400">{stats.rejected}</p>
                </div>
                <div className="bg-green-50 dark:bg-green-950/20 rounded-lg p-3 border border-green-200 dark:border-green-900">
                  <p className="text-xs text-green-900 dark:text-green-200">High Conf.</p>
                  <p className="text-xl font-bold text-green-600 dark:text-green-400">{stats.highConfidence}</p>
                </div>
                <div className="bg-yellow-50 dark:bg-yellow-950/20 rounded-lg p-3 border border-yellow-200 dark:border-yellow-900">
                  <p className="text-xs text-yellow-900 dark:text-yellow-200">Med. Conf.</p>
                  <p className="text-xl font-bold text-yellow-600 dark:text-yellow-400">{stats.mediumConfidence}</p>
                </div>
              </div>

              {/* Detected Fields List */}
              <DetectedFieldsList
                fields={detectedFields}
                onVerify={handleVerifyField}
                onReject={handleRejectField}
                isLoading={verifyFieldMutation.isPending}
              />

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setDetectedFields([]);
                    setVerifiedFields(new Set());
                    setRejectedFields(new Set());
                  }}
                  disabled={detectFieldsMutation.isPending || mergeFieldsMutation.isPending}
                >
                  Clear & Re-detect
                </Button>

                {existingFields.length > 0 && (
                  <Button
                    onClick={() => mergeFieldsMutation.mutate()}
                    disabled={mergeFieldsMutation.isPending || detectedFields.length === 0}
                  >
                    {mergeFieldsMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Merge with OCR Fields
                  </Button>
                )}

                <Button
                  variant="default"
                  onClick={() => onFieldsDetected?.(detectedFields.filter((f) => !rejectedFields.has(f.id)))}
                  disabled={detectedFields.length === rejectedFields.size}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Accept Detected Fields
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

/**
 * Convert detected field type to FormField type
 */
function mapDetectedFieldType(detectedType: string): FormField["type"] {
  const typeMap: Record<string, FormField["type"]> = {
    checkbox: "checkbox",
    radio: "radio",
    text_input: "text",
    text: "text",
    signature: "signature",
    date: "date",
    initial: "text",
    email: "email",
    phone: "phone",
    number: "number",
    textarea: "textarea",
  };

  return typeMap[detectedType.toLowerCase()] || "text";
}

/**
 * Calculate detection statistics
 */
function calculateStats(
  fields: FormField[],
  verified: Set<string>,
  rejected: Set<string>
): DetectionStats {
  return {
    total: fields.length,
    verified: verified.size,
    rejected: rejected.size,
    highConfidence: fields.filter((f) => (f.confidence ?? 0) >= 80).length,
    mediumConfidence: fields.filter((f) => (f.confidence ?? 0) >= 50 && (f.confidence ?? 0) < 80).length,
    lowConfidence: fields.filter((f) => (f.confidence ?? 0) < 50).length,
  };
}
