import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SignaturePad } from "@/components/SignaturePad";
import { QualityBanner, type QualityLevel } from "@/components/QualityBanner";
import { PaymentModal } from "@/components/PaymentModal";
import { PDFFieldEditor } from "@/components/PDFFieldEditor";
import { FieldDetectionPanel } from "@/components/FieldDetectionPanel";
import { FlowProgress } from "@/components/FlowProgress";
import { WelcomeBanner } from "@/components/WelcomeBanner";
import { HelpTip } from "@/components/HelpTip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import type { Form, FormField, Profile, FieldOverride } from "@shared/schema";

// Extended Form type with computed fields from API
interface FormWithQuality extends Form {
  effectiveFields?: FormField[];
  qualityLevel?: QualityLevel | null;
  qualityMessage?: string | null;
}

import {
  FileText,
  Loader2,
  CheckCircle2,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Save,
  Plus,
  Pencil,
  Trash2,
  Settings,
} from "lucide-react";

export default function FormFill() {
  const { formId } = useParams<{ formId: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isPro, user } = useAuth();

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [fieldOverrides, setFieldOverrides] = useState<FieldOverride[]>([]);
  const [editingField, setEditingField] = useState<FormField | null>(null);
  const [showFieldDialog, setShowFieldDialog] = useState(false);
  const [newFieldData, setNewFieldData] = useState<Partial<FormField>>({
    label: "",
    type: "text",
    required: false,
    page: 1,
    bbox: [10, 50, 40, 5],
  });

  // Fetch form data (includes computed quality fields from API)
  // Poll every 2 seconds while form is still processing
  const { data: form, isLoading: formLoading, error: formError } = useQuery<FormWithQuality>({
    queryKey: ["/api/forms", formId],
    enabled: !!formId,
    refetchInterval: (query) => {
      const data = query.state.data as FormWithQuality | undefined;
      // Keep polling while form is processing
      if (data?.status === "processing") {
        return 2000; // Poll every 2 seconds
      }
      return false; // Stop polling once ready/error
    },
  });

  // Fetch user profiles for autofill (Pro users)
  const { data: profiles } = useQuery<Profile[]>({
    queryKey: ["/api/profiles"],
    enabled: isPro,
  });
  
  // Get default profile or first profile for autofill
  const profile = profiles?.find(p => p.isDefault) || profiles?.[0];

  // Initialize answers and field overrides from form data
  useEffect(() => {
    if (form?.answers) {
      setAnswers(form.answers);
    }
    if (form?.signatureData) {
      setSignatureData(form.signatureData);
    }
    if (form?.fieldOverrides) {
      setFieldOverrides(form.fieldOverrides);
    }
  }, [form]);

  // Memoize effective fields computation for performance
  const effectiveFields = useMemo((): FormField[] => {
    if (!form?.fieldSchema) return [];
    
    let fields = [...form.fieldSchema];
    
    for (const override of fieldOverrides) {
      if (override.action === "delete") {
        fields = fields.filter(f => f.id !== override.fieldId);
      } else if (override.action === "edit" && override.modifiedField) {
        const idx = fields.findIndex(f => f.id === override.fieldId);
        if (idx !== -1) {
          fields[idx] = { ...fields[idx], ...override.modifiedField };
        }
      } else if (override.action === "add" && override.modifiedField) {
        if (!fields.find(f => f.id === override.modifiedField!.id)) {
          fields.push(override.modifiedField);
        }
      }
    }
    
    return fields;
  }, [form?.fieldSchema, fieldOverrides]);

  // Memoize pages array computation
  const pages = useMemo(() => {
    if (effectiveFields.length > 0) {
      return Array.from(new Set(effectiveFields.map((f) => f.page))).sort((a, b) => a - b);
    }
    if (form?.fieldSchema && form.fieldSchema.length > 0) {
      return Array.from(new Set(form.fieldSchema.map((f) => f.page))).sort((a, b) => a - b);
    }
    // Default to at least one page based on pageCount or 1
    const pageCount = form?.pageCount || 1;
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }, [effectiveFields, form?.fieldSchema, form?.pageCount]);

  // Memoize fields on current page
  const fieldsOnCurrentPage = useMemo(
    () => effectiveFields.filter((f) => f.page === currentPage),
    [effectiveFields, currentPage]
  );

  // Save answers mutation (includes field overrides)
  const saveAnswersMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PUT", `/api/forms/${formId}/answers`, {
        answers,
        signatureData,
        fieldOverrides,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forms", formId] });
    },
  });

  // Field editing functions
  const handleAddField = () => {
    const newField: FormField = {
      id: `custom_${Date.now()}`,
      label: newFieldData.label || "New Field",
      type: (newFieldData.type as FormField["type"]) || "text",
      page: currentPage,
      bbox: newFieldData.bbox || [10, 50, 40, 5],
      required: newFieldData.required || false,
      isManuallyAdded: true,
    };

    const override: FieldOverride = {
      fieldId: newField.id,
      action: "add",
      modifiedField: newField,
      timestamp: new Date().toISOString(),
    };

    setFieldOverrides([...fieldOverrides, override]);
    setShowFieldDialog(false);
    setNewFieldData({ label: "", type: "text", required: false, page: currentPage, bbox: [10, 50, 40, 5] });
    
    toast({ title: "Field Added!", description: "Hit Save to keep this change." });
  };

  const handleEditField = (field: FormField) => {
    setEditingField(field);
    setNewFieldData({
      label: field.label,
      type: field.type,
      required: field.required,
      page: field.page,
      bbox: field.bbox,
      options: field.options,
    });
    setShowFieldDialog(true);
  };

  const handleSaveFieldEdit = () => {
    if (!editingField) return;

    // Preserve all field properties and update only what changed
    const modifiedField: FormField = {
      id: editingField.id,
      label: newFieldData.label || editingField.label,
      type: (newFieldData.type as FormField["type"]) || editingField.type,
      page: newFieldData.page ?? editingField.page,
      bbox: newFieldData.bbox || editingField.bbox,
      required: newFieldData.required ?? editingField.required,
      options: newFieldData.options || editingField.options,
      confidence: editingField.confidence,
      isManuallyAdded: editingField.isManuallyAdded,
      isEdited: true,
    };

    // Check if this is a custom-added field
    const existingAddIdx = fieldOverrides.findIndex(
      o => o.fieldId === editingField.id && o.action === "add"
    );

    if (existingAddIdx !== -1) {
      // For added fields, update the add override directly
      const updated = [...fieldOverrides];
      updated[existingAddIdx] = {
        ...updated[existingAddIdx],
        modifiedField,
        timestamp: new Date().toISOString(),
      };
      setFieldOverrides(updated);
    } else {
      // For original OCR fields, find existing edit override or create new one
      const existingEditIdx = fieldOverrides.findIndex(
        o => o.fieldId === editingField.id && o.action === "edit"
      );

      // Get the original field from form.fieldSchema
      const originalField = form?.fieldSchema?.find(f => f.id === editingField.id);

      if (existingEditIdx !== -1) {
        // Update existing edit override, keep the original from first edit
        const updated = [...fieldOverrides];
        updated[existingEditIdx] = {
          ...updated[existingEditIdx],
          modifiedField,
          timestamp: new Date().toISOString(),
        };
        setFieldOverrides(updated);
      } else {
        // Create new edit override with actual original
        const override: FieldOverride = {
          fieldId: editingField.id,
          action: "edit",
          originalField: originalField || editingField,
          modifiedField,
          timestamp: new Date().toISOString(),
        };
        setFieldOverrides([...fieldOverrides, override]);
      }
    }

    setShowFieldDialog(false);
    setEditingField(null);
    setNewFieldData({ label: "", type: "text", required: false, page: currentPage, bbox: [10, 50, 40, 5] });
    
    toast({ title: "Field Updated!", description: "Hit Save to keep this change." });
  };

  const handleDeleteField = (fieldId: string) => {
    // Check if this field was added (not an original OCR field)
    const wasCustomAdded = fieldOverrides.some(o => o.fieldId === fieldId && o.action === "add");
    
    if (wasCustomAdded) {
      // Remove ALL overrides for this fieldId (add, edit, etc.) - field was custom-added
      const finalOverrides = fieldOverrides.filter(o => o.fieldId !== fieldId);
      setFieldOverrides(finalOverrides);
    } else {
      // Check if delete override already exists (prevent duplicates)
      const existingDeleteIdx = fieldOverrides.findIndex(
        o => o.fieldId === fieldId && o.action === "delete"
      );
      
      if (existingDeleteIdx !== -1) {
        // Already marked for deletion
        toast({ title: "Already Removed", description: "This field is already gone." });
        return;
      }

      // Get the original field for audit trail
      const originalField = form?.fieldSchema?.find(f => f.id === fieldId);
      
      // Remove any edit overrides for this field and add delete override
      const cleanedOverrides = fieldOverrides.filter(o => o.fieldId !== fieldId);
      
      const override: FieldOverride = {
        fieldId,
        action: "delete",
        originalField: originalField,
        timestamp: new Date().toISOString(),
      };
      setFieldOverrides([...cleanedOverrides, override]);
    }
    
    toast({ title: "Field Removed.", description: "Hit Save to keep this change." });
  };

  // Autofill from profile
  const handleAutofill = () => {
    if (!profile || !form?.fieldSchema) return;

    const profileMapping: Record<string, string> = {
      name: profile.fullName || "",
      full_name: profile.fullName || "",
      fullname: profile.fullName || "",
      email: profile.email || "",
      phone: profile.phone || "",
      telephone: profile.phone || "",
      dob: profile.dateOfBirth || "",
      date_of_birth: profile.dateOfBirth || "",
      birthday: profile.dateOfBirth || "",
      address: profile.address || "",
      street: profile.address || "",
      city: profile.city || "",
      state: profile.state || "",
      zip: profile.zipCode || "",
      zipcode: profile.zipCode || "",
      zip_code: profile.zipCode || "",
      postal: profile.zipCode || "",
      country: profile.country || "",
      employer: profile.employer || "",
      company: profile.employer || "",
      job: profile.jobTitle || "",
      job_title: profile.jobTitle || "",
      title: profile.jobTitle || "",
      position: profile.jobTitle || "",
    };

    const newAnswers = { ...answers };
    
    form.fieldSchema.forEach((field) => {
      const labelLower = field.label.toLowerCase().replace(/[^a-z0-9]/g, "_");
      
      for (const [key, value] of Object.entries(profileMapping)) {
        if (labelLower.includes(key) && value) {
          newAnswers[field.id] = value;
          break;
        }
      }
    });

    setAnswers(newAnswers);
    
    if (profile.signatureData) {
      setSignatureData(profile.signatureData);
    }

    toast({
      title: "Filled In!",
      description: "We filled in your info. Check it over and make any changes.",
    });
  };

  const handleFieldChange = (fieldId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [fieldId]: value }));
  };

  const handleFieldPositionChange = (fieldId: string, newX: number, newY: number) => {
    const field = effectiveFields.find(f => f.id === fieldId);
    if (!field) return;

    const wasCustomAdded = fieldOverrides.some(o => o.fieldId === fieldId && o.action === "add");
    
    if (wasCustomAdded) {
      const addIdx = fieldOverrides.findIndex(o => o.fieldId === fieldId && o.action === "add");
      if (addIdx !== -1 && fieldOverrides[addIdx].modifiedField) {
        const updated = [...fieldOverrides];
        updated[addIdx] = {
          ...updated[addIdx],
          modifiedField: {
            ...updated[addIdx].modifiedField!,
            bbox: [newX, newY, field.bbox[2], field.bbox[3]] as [number, number, number, number],
          },
          timestamp: new Date().toISOString(),
        };
        setFieldOverrides(updated);
      }
    } else {
      const existingEditIdx = fieldOverrides.findIndex(
        o => o.fieldId === fieldId && o.action === "edit"
      );

      const originalField = form?.fieldSchema?.find(f => f.id === fieldId);
      const modifiedField: FormField = {
        ...field,
        bbox: [newX, newY, field.bbox[2], field.bbox[3]] as [number, number, number, number],
      };

      if (existingEditIdx !== -1) {
        const updated = [...fieldOverrides];
        updated[existingEditIdx] = {
          ...updated[existingEditIdx],
          modifiedField,
          timestamp: new Date().toISOString(),
        };
        setFieldOverrides(updated);
      } else {
        const override: FieldOverride = {
          fieldId,
          action: "edit",
          originalField: originalField || field,
          modifiedField,
          timestamp: new Date().toISOString(),
        };
        setFieldOverrides([...fieldOverrides, override]);
      }
    }
  };

  const handlePageChange = async (direction: "next" | "prev") => {
    if (saveAnswersMutation.isPending) return;
    
    try {
      await saveAnswersMutation.mutateAsync();
    } catch (error) {
      console.error("Failed to save answers:", error);
    }
    
    if (direction === "next" && currentPage < pages.length) {
      setCurrentPage(currentPage + 1);
    } else if (direction === "prev" && currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleGeneratePDF = async () => {
    // Only require a signature if the form actually has a signature field
    const hasSignatureField = effectiveFields.some(f => f.type === "signature");
    if (hasSignatureField && !signatureData) {
      toast({
        title: "Please Sign the Form",
        description: "This form needs your signature. Draw it in the box below.",
        variant: "destructive",
      });
      return;
    }

    try {
      await saveAnswersMutation.mutateAsync();

      // Desktop / admin mode: skip payment modal, call generate directly
      if (user?.isAdmin) {
        const response = await apiRequest("POST", `/api/forms/${formId}/generate`, {});
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error((err as any).message || "Generation failed");
        }
        setLocation(`/download/${formId}`);
      } else {
        setShowPaymentModal(true);
      }
    } catch (error) {
      toast({
        title: "Something Did Not Work",
        description: "Could not save your answers. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handlePaymentSuccess = () => {
    setLocation(`/download/${formId}`);
  };

  const renderField = (field: FormField) => {
    const value = answers[field.id] || "";

    switch (field.type) {
      case "textarea":
        return (
          <Textarea
            id={field.id}
            value={value}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            placeholder={`Enter ${field.label.toLowerCase()}`}
            className="min-h-[100px]"
            data-testid={`input-${field.id}`}
          />
        );

      case "checkbox":
        return (
          <div className="flex items-center gap-2">
            <Checkbox
              id={field.id}
              checked={value === "true"}
              onCheckedChange={(checked) => handleFieldChange(field.id, String(checked))}
              data-testid={`checkbox-${field.id}`}
            />
            <Label htmlFor={field.id} className="font-normal cursor-pointer">
              {field.label}
            </Label>
          </div>
        );

      case "radio":
        return (
          <RadioGroup
            value={value}
            onValueChange={(val) => handleFieldChange(field.id, val)}
            data-testid={`radio-${field.id}`}
          >
            {field.options?.map((option, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <RadioGroupItem value={option} id={`${field.id}-${idx}`} />
                <Label htmlFor={`${field.id}-${idx}`} className="font-normal cursor-pointer">
                  {option}
                </Label>
              </div>
            ))}
          </RadioGroup>
        );

      case "date":
        return (
          <Input
            id={field.id}
            type="date"
            value={value}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            data-testid={`input-${field.id}`}
          />
        );

      case "email":
        return (
          <Input
            id={field.id}
            type="email"
            value={value}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            placeholder="email@autofillpdf.com"
            data-testid={`input-${field.id}`}
          />
        );

      case "phone":
        return (
          <Input
            id={field.id}
            type="tel"
            value={value}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            placeholder="(555) 123-4567"
            data-testid={`input-${field.id}`}
          />
        );

      case "number":
        return (
          <Input
            id={field.id}
            type="number"
            value={value}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            data-testid={`input-${field.id}`}
          />
        );

      default:
        return (
          <Input
            id={field.id}
            type="text"
            value={value}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            placeholder={`Enter ${field.label.toLowerCase()}`}
            data-testid={`input-${field.id}`}
          />
        );
    }
  };

  if (formLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-muted/20">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-12">
          <div className="max-w-3xl mx-auto space-y-6">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-6 w-1/2" />
            <Card>
              <CardContent className="p-6 space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (formError || !form) {
    return (
      <div className="min-h-screen flex flex-col bg-muted/20">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-12">
          <div className="max-w-lg mx-auto text-center space-y-4">
            <h1 className="text-2xl font-bold">Form not found</h1>
            <p className="text-muted-foreground">
              This form may have expired or doesn't exist.
            </p>
            <Button onClick={() => setLocation("/upload")} data-testid="button-upload-new">
              Upload a new form
            </Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const progressPercent = pages.length > 0 ? (currentPage / pages.length) * 100 : 0;

  return (
    <div className="min-h-screen flex flex-col bg-muted/20">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-8 md:py-12">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Header */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Complete Your Form</h1>
                <p className="text-muted-foreground text-sm">{form.fileName}</p>
              </div>
            </div>
          </div>

          <FlowProgress current="fill" />
          <WelcomeBanner
            storageKey="formfill"
            emoji="✏️"
            heading="Fill In the Boxes"
            body="Type your answers in each box. When you are done with all the pages, click Make My PDF at the bottom."
          />

          {/* Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Page {currentPage} of {pages.length}
              </span>
              <span className="font-medium">{Math.round(progressPercent)}% complete</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </div>

          {/* Processing Banner - show while OCR is running */}
          {form.status === "processing" && (
            <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-400" />
                  <div>
                    <p className="font-medium text-blue-900 dark:text-blue-100">Analyzing your form...</p>
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      We're detecting all fillable fields. This usually takes 10-30 seconds.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quality Banner - show only when OCR has completed (not processing) */}
          {form.status !== "processing" && form.ocrConfidence !== null && form.ocrConfidence !== undefined && (
            <QualityBanner
              confidence={form.ocrConfidence}
              fieldsDetected={form.fieldSchema?.length || 0}
              qualityLevel={form.qualityLevel}
              qualityMessage={form.qualityMessage}
              onReupload={() => setLocation("/upload")}
            />
          )}

          {/* Field Detection Panel */}
          {form.status !== "processing" && (
            <FieldDetectionPanel
              formId={formId!}
              currentPageCount={form.pageCount || 1}
              existingFields={form.fieldSchema || []}
              onFieldsDetected={(detectedFields) => {
                // Add detected fields that weren't rejected
                detectedFields.forEach((field) => {
                  if (!fieldOverrides.some(o => o.fieldId === field.id)) {
                    setFieldOverrides([...fieldOverrides, {
                      fieldId: field.id,
                      action: "add",
                      modifiedField: field,
                      timestamp: new Date().toISOString(),
                    }]);
                  }
                });
                toast({
                  title: "Fields added",
                  description: `${detectedFields.length} detected field${detectedFields.length !== 1 ? "s" : ""} have been added`,
                });
              }}
              onMergeComplete={(mergedFields) => {
                // Replace field schema with merged fields
                queryClient.invalidateQueries({ queryKey: ["/api/forms", formId] });
                toast({
                  title: "Merge complete",
                  description: "Detected and OCR fields have been merged",
                });
              }}
            />
          )}

          {/* Action Buttons Row */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Autofill Button for Pro users */}
            {isPro && profile && (
              <Button
                variant="outline"
                onClick={handleAutofill}
                data-testid="button-autofill"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Autofill from Profile
              </Button>
            )}
            
            {/* Edit Mode Toggle */}
            <Button
              variant={editMode ? "default" : "outline"}
              onClick={() => setEditMode(!editMode)}
              data-testid="button-toggle-edit"
            >
              <Settings className="mr-2 h-4 w-4" />
              {editMode ? "I Am Done Fixing" : "Fix the Fields"}
            </Button>
            <HelpTip
              title="What is Fix the Fields?"
              body="If a label is wrong or a box is missing, click this. You can rename fields, delete them, or add new ones."
              tip="Most forms work fine without using this."
            />

            {/* Add Field Button (only in edit mode) */}
            {editMode && (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditingField(null);
                    setNewFieldData({ label: "", type: "text", required: false, page: currentPage, bbox: [10, 50, 40, 5] });
                    setShowFieldDialog(true);
                  }}
                  data-testid="button-add-field"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  + Add a Field
                </Button>
                <HelpTip
                  title="Add a Missing Box"
                  body="Use this if your form is missing a box that you need to fill in. Click it and type a name for the new box."
                />
              </>
            )}

            {/* Unsaved changes indicator */}
            {fieldOverrides.length > 0 && (
              <span className="text-sm text-muted-foreground">
                {fieldOverrides.length} change{fieldOverrides.length > 1 ? "s" : ""} not saved yet
              </span>
            )}
          </div>

          {/* Visual Field Editor (only in edit mode) */}
          {editMode && form && (
            <PDFFieldEditor
              formId={formId!}
              pageCount={form.pageCount || 1}
              currentPage={currentPage}
              fields={effectiveFields}
              onFieldPositionChange={handleFieldPositionChange}
              onPageChange={(page) => setCurrentPage(page)}
              onFieldClick={(field) => handleEditField(field)}
            />
          )}

          {/* Form Fields */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {pages.length > 1 ? `Page ${currentPage}` : "Form Fields"}
              </CardTitle>
              <CardDescription>
                Fill in the fields below. We'll place your answers onto the original PDF.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {fieldsOnCurrentPage.length > 0 ? (
                fieldsOnCurrentPage.map((field) => (
                  <div key={field.id} className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      {field.type !== "checkbox" && (
                        <Label htmlFor={field.id} className="flex items-center gap-1 flex-1">
                          {field.label}
                          {field.required && <span className="text-primary">*</span>}
                          {field.isManuallyAdded && (
                            <span className="text-xs text-muted-foreground ml-1">(custom)</span>
                          )}
                          {field.isEdited && (
                            <span className="text-xs text-muted-foreground ml-1">(edited)</span>
                          )}
                        </Label>
                      )}
                      
                      {/* Edit mode controls */}
                      {editMode && (
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleEditField(field)}
                            data-testid={`button-edit-field-${field.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDeleteField(field.id)}
                            data-testid={`button-delete-field-${field.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </div>
                    {renderField(field)}
                    {field.confidence && field.confidence < 70 && (
                      <p className="text-xs text-muted-foreground">
                        Detected with {Math.round(field.confidence)}% confidence
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  No fields detected on this page.
                  {editMode && (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setEditingField(null);
                        setNewFieldData({ label: "", type: "text", required: false, page: currentPage, bbox: [10, 50, 40, 5] });
                        setShowFieldDialog(true);
                      }}
                      className="block mx-auto mt-2 text-primary hover:text-primary/80"
                    >
                      + Add a Field
                    </Button>
                  )}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Signature (show on last page) */}
          {currentPage === pages.length && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Signature</CardTitle>
                    <CardDescription>
                      Sign below. Your signature will be placed on the form.
                    </CardDescription>
                  </div>
                  <HelpTip
                    title="Why do I need to sign?"
                    body="Some forms need your signature. Draw your name or initials in the white box using your mouse or trackpad."
                    tip="If you make a mistake, click Clear to start over."
                  />
                </div>
              </CardHeader>
              <CardContent>
                <SignaturePad
                  onSignatureChange={setSignatureData}
                  initialSignature={signatureData}
                />
              </CardContent>
            </Card>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between pt-4">
            <Button
              variant="outline"
              onClick={() => handlePageChange("prev")}
              disabled={currentPage === 1 || saveAnswersMutation.isPending}
              data-testid="button-prev-page"
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              ← Previous Page
            </Button>

            {currentPage < pages.length ? (
              <Button
                onClick={() => handlePageChange("next")}
                disabled={saveAnswersMutation.isPending}
                data-testid="button-next-page"
              >
                {saveAnswersMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Next Page →
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={handleGeneratePDF}
                disabled={saveAnswersMutation.isPending}
                data-testid="button-generate-pdf"
              >
                {saveAnswersMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                Make My PDF
              </Button>
            )}
          </div>

          {/* Save indicator */}
          {saveAnswersMutation.isPending && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </div>
          )}
        </div>
      </main>

      <Footer />

      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        formId={formId!}
        onPaymentSuccess={handlePaymentSuccess}
      />

      {/* Field Edit/Add Dialog */}
      <Dialog open={showFieldDialog} onOpenChange={setShowFieldDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingField ? "Edit This Field" : "Add a New Field"}</DialogTitle>
            <DialogDescription>
              {editingField 
                ? "Modify the field properties below." 
                : "Add a custom field to your form."}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="field-label">Field Name</Label>
              <Input
                id="field-label"
                value={newFieldData.label || ""}
                onChange={(e) => setNewFieldData({ ...newFieldData, label: e.target.value })}
                placeholder="e.g., Full Name, Email Address"
                data-testid="input-field-label"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="field-type">What Kind of Field?</Label>
              <Select
                value={newFieldData.type || "text"}
                onValueChange={(value) => setNewFieldData({ ...newFieldData, type: value as FormField["type"] })}
              >
                <SelectTrigger data-testid="select-field-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="textarea">Text Area</SelectItem>
                  <SelectItem value="number">Number</SelectItem>
                  <SelectItem value="date">Date</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="phone">Phone</SelectItem>
                  <SelectItem value="checkbox">Checkbox</SelectItem>
                  <SelectItem value="signature">Signature</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Page Number</Label>
              <Select
                value={String(newFieldData.page || 1)}
                onValueChange={(value) => setNewFieldData({ ...newFieldData, page: parseInt(value, 10) })}
              >
                <SelectTrigger data-testid="select-field-page">
                  <SelectValue placeholder="Select page" />
                </SelectTrigger>
                <SelectContent>
                  {pages.map((p) => (
                    <SelectItem key={p} value={String(p)}>Page {p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Position (X%, Y%, Width%, Height%)</Label>
              <div className="grid grid-cols-4 gap-2">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={newFieldData.bbox?.[0] ?? 10}
                  onChange={(e) => {
                    const bbox = [...(newFieldData.bbox || [10, 50, 40, 5])];
                    bbox[0] = parseFloat(e.target.value) || 0;
                    setNewFieldData({ ...newFieldData, bbox: bbox as [number, number, number, number] });
                  }}
                  placeholder="X%"
                  data-testid="input-field-x"
                />
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={newFieldData.bbox?.[1] ?? 50}
                  onChange={(e) => {
                    const bbox = [...(newFieldData.bbox || [10, 50, 40, 5])];
                    bbox[1] = parseFloat(e.target.value) || 0;
                    setNewFieldData({ ...newFieldData, bbox: bbox as [number, number, number, number] });
                  }}
                  placeholder="Y%"
                  data-testid="input-field-y"
                />
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={newFieldData.bbox?.[2] ?? 40}
                  onChange={(e) => {
                    const bbox = [...(newFieldData.bbox || [10, 50, 40, 5])];
                    bbox[2] = parseFloat(e.target.value) || 0;
                    setNewFieldData({ ...newFieldData, bbox: bbox as [number, number, number, number] });
                  }}
                  placeholder="Width%"
                  data-testid="input-field-width"
                />
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={newFieldData.bbox?.[3] ?? 5}
                  onChange={(e) => {
                    const bbox = [...(newFieldData.bbox || [10, 50, 40, 5])];
                    bbox[3] = parseFloat(e.target.value) || 0;
                    setNewFieldData({ ...newFieldData, bbox: bbox as [number, number, number, number] });
                  }}
                  placeholder="Height%"
                  data-testid="input-field-height"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Position and size as percentages of page dimensions
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              <Checkbox
                id="field-required"
                checked={newFieldData.required || false}
                onCheckedChange={(checked) => setNewFieldData({ ...newFieldData, required: !!checked })}
                data-testid="checkbox-field-required"
              />
              <Label htmlFor="field-required" className="font-normal cursor-pointer">
                Is This Required?
              </Label>
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowFieldDialog(false);
                setEditingField(null);
              }}
              data-testid="button-cancel-field"
            >
              Cancel
            </Button>
            <Button
              onClick={editingField ? handleSaveFieldEdit : handleAddField}
              disabled={!newFieldData.label?.trim()}
              data-testid="button-save-field"
            >
              Save Field
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
