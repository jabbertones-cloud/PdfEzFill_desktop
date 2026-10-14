import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Form } from "@shared/schema";
import {
  Upload as UploadIcon,
  FileText,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Database,
  ArrowRight,
  Download,
  Clock,
} from "lucide-react";
import { BatchColumnMapper } from "@/components/BatchColumnMapper";
import { BatchProgressTracker } from "@/components/BatchProgressTracker";

interface DataSourceInfo {
  rowCount: number;
  columns: string[];
  preview: Record<string, string>[];
}

interface ColumnMapping {
  sourceColumn: string;
  fieldLabel: string;
  confidence: number;
}

interface MappingResponse {
  mappings: ColumnMapping[];
  unmappedCount: number;
}

type Step = 1 | 2 | 3 | 4 | 5;

export default function BatchFill() {
  const { toast } = useToast();
  const { user, isPro, isLoading: authLoading } = useAuth();
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [selectedFormId, setSelectedFormId] = useState<string>("");
  const [dataFile, setDataFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dataSourceInfo, setDataSourceInfo] = useState<DataSourceInfo | null>(null);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [jobId, setJobId] = useState<string>("");
  const [outputZipUrl, setOutputZipUrl] = useState<string>("");
  const [generationProgress, setGenerationProgress] = useState(0);

  const { data: forms, isLoading: formsLoading } = useQuery<Form[]>({
    queryKey: ["/api/forms"],
    enabled: isPro,
  });

  const selectedForm = forms?.find((f) => f.id === selectedFormId);

  // Step 1: Select form
  const handleSelectForm = (formId: string) => {
    setSelectedFormId(formId);
  };

  // Step 2: Upload data file
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && (droppedFile.type === "text/csv" || droppedFile.type === "application/json")) {
      setDataFile(droppedFile);
      parseDataFile(droppedFile);
    } else {
      toast({
        title: "Invalid file type",
        description: "Please upload a CSV or JSON file.",
        variant: "destructive",
      });
    }
  }, [toast]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type === "text/csv" || selectedFile.type === "application/json") {
        setDataFile(selectedFile);
        parseDataFile(selectedFile);
      } else {
        toast({
          title: "Invalid file type",
          description: "Please upload a CSV or JSON file.",
          variant: "destructive",
        });
      }
    }
  }, [toast]);

  const parseDataFileMutation = useMutation({
    mutationFn: async (file: File) => {
      const content = await file.text();
      const format = file.type === "text/csv" ? "csv" : "json";

      const res = await apiRequest("POST", "/api/batch/upload-data", {
        data: content,
        format,
      });
      return res.json() as Promise<DataSourceInfo>;
    },
    onSuccess: (data) => {
      setDataSourceInfo(data);
      toast({
        title: "Data file parsed",
        description: `Found ${data.rowCount} rows with ${data.columns.length} columns`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to parse data file",
        description: error.message,
        variant: "destructive",
      });
      setDataFile(null);
    },
  });

  const parseDataFile = (file: File) => {
    parseDataFileMutation.mutate(file);
  };

  // Step 3: Auto-map columns
  const autoMapMutation = useMutation({
    mutationFn: async () => {
      if (!dataSourceInfo || !selectedForm?.fieldSchema) {
        throw new Error("Missing data source or form fields");
      }

      const fieldLabels = selectedForm.fieldSchema.map((f) => f.label);

      const res = await apiRequest("POST", "/api/batch/map-columns", {
        columns: dataSourceInfo.columns,
        fieldLabels,
      });
      return res.json() as Promise<MappingResponse>;
    },
    onSuccess: (data) => {
      setColumnMappings(data.mappings);
      setCurrentStep(4);
      toast({
        title: "Columns mapped",
        description: `${data.mappings.length - data.unmappedCount} of ${data.mappings.length} columns matched`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to map columns",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Step 4: Generate batch
  const generateBatchMutation = useMutation({
    mutationFn: async () => {
      if (!dataFile || !dataSourceInfo || !selectedForm) {
        throw new Error("Missing required data");
      }

      const content = await dataFile.text();
      const format = dataFile.type === "text/csv" ? "csv" : "json";

      // Build mappings object
      const mappingsObj: Record<string, string> = {};
      columnMappings.forEach((mapping) => {
        if (mapping.fieldLabel) {
          mappingsObj[mapping.sourceColumn] = mapping.fieldLabel;
        }
      });

      // Get template PDF
      const templateRes = await fetch(`/api/forms/${selectedForm.id}/download`);
      if (!templateRes.ok) {
        throw new Error("Failed to download template PDF");
      }
      const templateBlob = await templateRes.blob();

      // Create form data for batch generation
      const formData = new FormData();
      formData.append("template", templateBlob);
      formData.append("data", content);
      formData.append("format", format);
      formData.append("mappings", JSON.stringify(mappingsObj));

      const response = await fetch("/api/batch/generate", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Batch generation failed");
      }

      // Get blob and create download URL
      const zipBlob = await response.blob();
      const url = window.URL.createObjectURL(zipBlob);
      return url;
    },
    onSuccess: (zipUrl) => {
      setOutputZipUrl(zipUrl);
      setCurrentStep(5);
      setGenerationProgress(100);
      toast({
        title: "Batch completed!",
        description: "All PDFs have been generated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to generate batch",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleDownload = () => {
    if (outputZipUrl && selectedForm) {
      const link = document.createElement("a");
      link.href = outputZipUrl;
      link.download = `${selectedForm.fileName.replace(/\.pdf$/i, "")}_batch_${Date.now()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const canProceedStep1 = selectedFormId && selectedForm?.fieldSchema && selectedForm.fieldSchema.length > 0;
  const canProceedStep2 = dataSourceInfo && dataSourceInfo.rowCount > 0;
  const canProceedStep3 = columnMappings.length > 0;

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-muted/20">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-12">
          <div className="max-w-4xl mx-auto">
            <Skeleton className="h-10 w-48 mb-8" />
            <Skeleton className="h-96" />
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!isPro) {
    return (
      <div className="min-h-screen flex flex-col bg-muted/20">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-12">
          <div className="max-w-lg mx-auto text-center space-y-6">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Database className="h-10 w-10 text-primary" />
            </div>
            <h1 className="text-2xl font-bold">Subscribe to Use Batch Fill</h1>
            <p className="text-muted-foreground">
              Get access to batch fill your forms with CSV or JSON data, perfect for bulk form filling workflows.
            </p>
            <Button asChild>
              <a href="/#pricing">View Plans — Starting at $7/mo</a>
            </Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-muted/20">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-8 md:py-12">
        <div className="max-w-4xl mx-auto space-y-8">
          <div>
            <h1 className="text-3xl font-bold">Batch Fill</h1>
            <p className="text-muted-foreground">
              Fill multiple forms at once using CSV or JSON data
            </p>
          </div>

          {/* Step indicator */}
          <div className="flex items-center justify-between mb-8">
            {[1, 2, 3, 4, 5].map((step) => (
              <div key={step} className="flex items-center flex-1">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-medium text-sm ${
                    step < currentStep
                      ? "bg-primary text-primary-foreground"
                      : step === currentStep
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {step < currentStep ? <CheckCircle2 className="w-5 h-5" /> : step}
                </div>
                {step < 5 && (
                  <div
                    className={`flex-1 h-1 mx-2 ${
                      step < currentStep ? "bg-primary" : "bg-muted"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Step 1: Select Form */}
          {currentStep === 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                    1
                  </span>
                  Select Form Template
                </CardTitle>
                <CardDescription>
                  Choose the PDF form you want to fill with batch data
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {formsLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-16" />
                    ))}
                  </div>
                ) : forms && forms.length > 0 ? (
                  <div className="grid gap-3">
                    {forms.map((form) => (
                      <div
                        key={form.id}
                        className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                          selectedFormId === form.id
                            ? "border-primary bg-primary/5"
                            : "border-muted hover:border-primary/50"
                        }`}
                        onClick={() => handleSelectForm(form.id)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3 flex-1">
                            <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                            <div>
                              <p className="font-medium">{form.fileName}</p>
                              <p className="text-sm text-muted-foreground">
                                {form.fieldSchema?.length || 0} fields
                              </p>
                            </div>
                          </div>
                          {selectedFormId === form.id && (
                            <Badge>Selected</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground">No forms available</p>
                    <Button variant="outline" size="sm" className="mt-4" asChild>
                      <a href="/upload">Upload a Form</a>
                    </Button>
                  </div>
                )}

                <div className="flex gap-3 justify-end pt-4 border-t">
                  <Button
                    onClick={() => setCurrentStep(2)}
                    disabled={!canProceedStep1}
                  >
                    Continue
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Upload Data */}
          {currentStep === 2 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                    2
                  </span>
                  Upload Data File
                </CardTitle>
                <CardDescription>
                  Upload a CSV or JSON file containing the data to fill your forms
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!dataFile ? (
                  <label
                    htmlFor="data-upload"
                    className={`
                      flex flex-col items-center justify-center
                      min-h-[240px] p-8 cursor-pointer
                      border-2 border-dashed rounded-xl
                      transition-all duration-200
                      ${isDragging
                        ? "border-primary bg-primary/5"
                        : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
                      }
                    `}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    <input
                      id="data-upload"
                      type="file"
                      accept=".csv,.json"
                      className="hidden"
                      onChange={handleFileSelect}
                    />

                    <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                      <UploadIcon className={`h-8 w-8 text-primary ${isDragging ? "animate-bounce" : ""}`} />
                    </div>

                    <p className="text-lg font-medium mb-2 text-center">
                      {isDragging ? "Drop your file here" : "Drag CSV or JSON here"}
                    </p>
                    <p className="text-sm text-muted-foreground text-center">
                      or click to browse
                    </p>
                  </label>
                ) : parseDataFileMutation.isPending ? (
                  <div className="flex flex-col items-center justify-center min-h-[240px] gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-muted-foreground">Parsing data file...</p>
                  </div>
                ) : dataSourceInfo ? (
                  <div className="space-y-4">
                    <div className="flex items-start gap-4 p-4 bg-muted/50 rounded-lg">
                      <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Database className="h-6 w-6 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium truncate">{dataFile.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatFileSize(dataFile.size)}
                        </p>
                        <div className="mt-2 space-y-1 text-sm">
                          <p className="text-muted-foreground">
                            <strong>{dataSourceInfo.rowCount}</strong> rows
                          </p>
                          <p className="text-muted-foreground">
                            <strong>{dataSourceInfo.columns.length}</strong> columns
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setDataFile(null);
                          setDataSourceInfo(null);
                        }}
                      >
                        <X className="h-5 w-5" />
                      </Button>
                    </div>

                    {/* Show preview */}
                    {dataSourceInfo.preview.length > 0 && (
                      <div className="bg-muted/30 rounded-lg p-4 overflow-x-auto">
                        <p className="text-sm font-medium mb-3">Preview (first 3 rows):</p>
                        <div className="text-xs overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b">
                                {dataSourceInfo.columns.map((col) => (
                                  <th key={col} className="text-left p-2 font-medium">
                                    {col}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {dataSourceInfo.preview.map((row, idx) => (
                                <tr key={idx} className="border-b last:border-b-0">
                                  {dataSourceInfo.columns.map((col) => (
                                    <td key={`${idx}-${col}`} className="p-2">
                                      {row[col] || "-"}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}

                <div className="flex gap-3 justify-end pt-4 border-t">
                  <Button variant="outline" onClick={() => setCurrentStep(1)}>
                    Back
                  </Button>
                  <Button
                    onClick={() => {
                      autoMapMutation.mutate();
                    }}
                    disabled={!canProceedStep2 || autoMapMutation.isPending}
                  >
                    {autoMapMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        Continue
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 4: Column Mapping */}
          {currentStep === 4 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                    3
                  </span>
                  Map Columns to Fields
                </CardTitle>
                <CardDescription>
                  Review and adjust the automatic column mappings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {columnMappings.length > 0 && selectedForm?.fieldSchema && (
                  <BatchColumnMapper
                    mappings={columnMappings}
                    onMappingsChange={setColumnMappings}
                    formFields={selectedForm.fieldSchema}
                  />
                )}

                <div className="flex gap-3 justify-end pt-4 border-t">
                  <Button variant="outline" onClick={() => setCurrentStep(2)}>
                    Back
                  </Button>
                  <Button
                    onClick={() => {
                      setGenerationProgress(10);
                      generateBatchMutation.mutate();
                    }}
                    disabled={!canProceedStep3 || generateBatchMutation.isPending}
                  >
                    {generateBatchMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        Generate Batch
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 5: Download Results */}
          {currentStep === 5 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                    <CheckCircle2 className="w-5 h-5" />
                  </span>
                  Download Results
                </CardTitle>
                <CardDescription>
                  Your batch fill is complete! Download the ZIP file containing all filled PDFs.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {outputZipUrl && (
                  <div className="p-6 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-lg bg-green-100 dark:bg-green-900 flex items-center justify-center flex-shrink-0">
                        <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-green-900 dark:text-green-50">
                          Batch generation successful!
                        </p>
                        <p className="text-sm text-green-700 dark:text-green-200 mt-1">
                          {dataSourceInfo?.rowCount || 0} PDFs have been generated and are ready to download.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <Button
                  onClick={handleDownload}
                  size="lg"
                  className="w-full"
                  disabled={!outputZipUrl}
                >
                  <Download className="mr-2 h-5 w-5" />
                  Download ZIP ({dataSourceInfo?.rowCount || 0} files)
                </Button>

                <Button
                  variant="outline"
                  onClick={() => {
                    setCurrentStep(1);
                    setSelectedFormId("");
                    setDataFile(null);
                    setDataSourceInfo(null);
                    setColumnMappings([]);
                    setOutputZipUrl("");
                  }}
                  className="w-full"
                >
                  Start Another Batch
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
