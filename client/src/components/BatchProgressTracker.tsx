import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, Clock, Loader2 } from "lucide-react";

interface ProgressTrackerProps {
  jobId: string;
  totalFiles: number;
  onComplete?: (zipUrl: string) => void;
}

interface BatchProgress {
  jobId: string;
  status: "processing" | "completed" | "failed";
  completed: number;
  total: number;
  percent: number;
  errorMessage?: string;
  outputZipUrl?: string;
  estimatedSecondsRemaining?: number;
}

export function BatchProgressTracker({
  jobId,
  totalFiles,
  onComplete,
}: ProgressTrackerProps) {
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [isPolling, setIsPolling] = useState(true);

  useEffect(() => {
    if (!isPolling || !jobId) return;

    const pollProgress = async () => {
      try {
        const res = await fetch(`/api/batch/progress/${jobId}`, {
          credentials: "include",
        });

        if (res.ok) {
          const data = await res.json() as BatchProgress;
          setProgress(data);

          if (data.status === "completed") {
            setIsPolling(false);
            if (onComplete && data.outputZipUrl) {
              onComplete(data.outputZipUrl);
            }
          } else if (data.status === "failed") {
            setIsPolling(false);
          }
        }
      } catch (error) {
        console.error("Failed to fetch progress:", error);
      }
    };

    // Poll every 500ms
    const interval = setInterval(pollProgress, 500);
    return () => clearInterval(interval);
  }, [jobId, isPolling, onComplete]);

  if (!progress) {
    return (
      <Card>
        <CardContent className="p-8 flex flex-col items-center justify-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Starting batch generation...</p>
        </CardContent>
      </Card>
    );
  }

  const formatTimeRemaining = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s`;
  };

  const statusColor = {
    processing: "text-blue-600 dark:text-blue-400",
    completed: "text-green-600 dark:text-green-400",
    failed: "text-red-600 dark:text-red-400",
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Batch Progress</CardTitle>
            <Badge
              variant={
                progress.status === "completed"
                  ? "default"
                  : progress.status === "failed"
                    ? "destructive"
                    : "secondary"
              }
            >
              {progress.status === "processing" && (
                <span className="flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Processing
                </span>
              )}
              {progress.status === "completed" && (
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Completed
                </span>
              )}
              {progress.status === "failed" && (
                <span className="flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Failed
                </span>
              )}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Overall progress bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Overall Progress</p>
              <p className="text-sm font-bold">{progress.percent}%</p>
            </div>
            <Progress value={progress.percent} className="h-3" />
          </div>

          {/* Completed files counter */}
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">Completed</p>
              <p className="text-2xl font-bold">{progress.completed}</p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">Total</p>
              <p className="text-2xl font-bold">{progress.total}</p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">Remaining</p>
              <p className="text-2xl font-bold">
                {progress.total - progress.completed}
              </p>
            </div>
          </div>

          {/* Time remaining */}
          {progress.status === "processing" &&
            progress.estimatedSecondsRemaining &&
            progress.estimatedSecondsRemaining > 0 && (
              <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800 flex items-center gap-3">
                <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-50">
                    Estimated time remaining
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-200">
                    {formatTimeRemaining(progress.estimatedSecondsRemaining)}
                  </p>
                </div>
              </div>
            )}

          {/* Error message */}
          {progress.status === "failed" && progress.errorMessage && (
            <div className="p-4 bg-red-50 dark:bg-red-950 rounded-lg border border-red-200 dark:border-red-800 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-900 dark:text-red-50">
                  Batch generation failed
                </p>
                <p className="text-xs text-red-700 dark:text-red-200 mt-1">
                  {progress.errorMessage}
                </p>
              </div>
            </div>
          )}

          {/* Success message */}
          {progress.status === "completed" && (
            <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800 flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-green-900 dark:text-green-50">
                  Batch generation complete
                </p>
                <p className="text-xs text-green-700 dark:text-green-200 mt-1">
                  All {progress.total} PDFs have been generated successfully
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* File status indicators */}
      {progress.completed > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                {progress.completed} of {progress.total} forms filled
              </p>
              {progress.estimatedSecondsRemaining &&
                progress.estimatedSecondsRemaining > 0 && (
                  <p className="text-muted-foreground">
                    Estimated time remaining:{" "}
                    <strong>
                      {formatTimeRemaining(progress.estimatedSecondsRemaining)}
                    </strong>
                  </p>
                )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
