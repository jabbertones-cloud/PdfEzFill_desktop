import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { FlowProgress } from "@/components/FlowProgress";
import { WelcomeBanner } from "@/components/WelcomeBanner";
import {
  Upload as UploadIcon,
  FileText,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Shield,
  Clock,
} from "lucide-react";

interface UploadResponse {
  formId: string;
  status: string;
  message: string;
}

export default function Upload() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const uploadMutation = useMutation({
    mutationFn: async (file: File): Promise<UploadResponse> => {
      const formData = new FormData();
      formData.append("pdf", file);
      
      const response = await fetch("/api/forms/upload", {
        method: "POST",
        body: formData,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Upload failed");
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Got it! Looking at your form now...",
        description: "This takes just a few seconds.",
      });
      setLocation(`/fill/${data.formId}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Something did not work",
        description: error.message,
        variant: "destructive",
      });
      setFile(null);
      setUploadProgress(0);
    },
  });

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
    if (droppedFile && droppedFile.type === "application/pdf") {
      setFile(droppedFile);
    } else {
      toast({
        title: "That is not a PDF",
        description: "Please pick a file that ends in .pdf",
        variant: "destructive",
      });
    }
  }, [toast]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type === "application/pdf") {
        setFile(selectedFile);
      } else {
        toast({
          title: "That is not a PDF",
          description: "Please pick a file that ends in .pdf",
          variant: "destructive",
        });
      }
    }
  }, [toast]);

  const handleUpload = useCallback(() => {
    if (file) {
      setUploadProgress(10);
      const interval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) {
            clearInterval(interval);
            return prev;
          }
          return prev + 10;
        });
      }, 200);
      
      uploadMutation.mutate(file);
    }
  }, [file, uploadMutation]);

  const handleRemoveFile = useCallback(() => {
    setFile(null);
    setUploadProgress(0);
  }, []);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  return (
    <div className="min-h-screen flex flex-col bg-muted/20">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-12 md:py-20">
        <div className="max-w-2xl mx-auto space-y-8">
          <FlowProgress current="upload" />
          <WelcomeBanner
            storageKey="upload"
            emoji="👋"
            heading="Welcome to PdfEzFill!"
            body="Pick a PDF form from your computer. We will find all the boxes for you to fill in. It only takes a few seconds!"
          />

          <div className="text-center space-y-4">
            <h1 className="text-3xl md:text-4xl font-bold">Step 1: Pick Your PDF</h1>
            <p className="text-muted-foreground text-lg">
              Pick a PDF from your computer. We will find all the boxes to fill in for you.
            </p>
          </div>

          <Card className="border-2">
            <CardContent className="p-0">
              {!file ? (
                <label
                  htmlFor="pdf-upload"
                  className={`
                    flex flex-col items-center justify-center 
                    min-h-[320px] p-8 cursor-pointer
                    border-2 border-dashed rounded-xl m-4
                    transition-all duration-200
                    ${isDragging 
                      ? "border-primary bg-primary/5" 
                      : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
                    }
                  `}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  data-testid="dropzone-upload"
                >
                  <input
                    id="pdf-upload"
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={handleFileSelect}
                    data-testid="input-file-upload"
                  />
                  
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                    <UploadIcon className={`h-8 w-8 text-primary ${isDragging ? "animate-bounce" : ""}`} />
                  </div>
                  
                  <p className="text-lg font-medium mb-2">
                    {isDragging ? "Let go to pick this PDF!" : "Click here or drag your PDF file here"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Only PDF files • Up to 10 MB in size
                  </p>
                </label>
              ) : (
                <div className="p-6 space-y-6">
                  <div className="flex items-start gap-4 p-4 bg-muted/50 rounded-lg">
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <FileText className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{file.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatFileSize(file.size)}
                      </p>
                    </div>
                    {!uploadMutation.isPending && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleRemoveFile}
                        data-testid="button-remove-file"
                      >
                        <X className="h-5 w-5" />
                      </Button>
                    )}
                  </div>

                  {uploadMutation.isPending && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Uploading and analyzing...</span>
                        <span className="font-medium">{uploadProgress}%</span>
                      </div>
                      <Progress value={uploadProgress} className="h-2" />
                    </div>
                  )}

                  {!uploadMutation.isPending && (
                    <Button
                      className="w-full h-12"
                      onClick={handleUpload}
                      data-testid="button-start-upload"
                    >
                      <UploadIcon className="mr-2 h-5 w-5" />
                      Next — Find My Fields
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Trust indicators */}
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              {
                icon: CheckCircle2,
                title: "Works with scanned forms",
                description: "Even photos and non-fillable PDFs",
              },
              {
                icon: Shield,
                title: "Secure & private",
                description: "Files deleted after 72 hours",
              },
              {
                icon: Clock,
                title: "Done in minutes",
                description: "Most forms take under 5 min",
              },
            ].map((item, index) => (
              <Card key={index} className="border-0 shadow-none bg-transparent">
                <CardContent className="flex items-start gap-3 p-4">
                  <item.icon className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
