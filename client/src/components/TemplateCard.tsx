import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { FormTemplate } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { Eye, Trash2, FileText } from "lucide-react";

interface TemplateCardProps {
  template: FormTemplate;
}

export function TemplateCard({ template }: TemplateCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Calculate success rate
  const totalMatches = template.match_success_count + template.match_failure_count;
  const successRate = totalMatches > 0 ? (template.match_success_count / totalMatches) * 100 : 0;

  // Delete mutation (placeholder - would need actual API endpoint)
  const deleteMutation = useMutation({
    mutationFn: async () => {
      // This would be implemented when delete endpoint is created
      // For now, just show a message
      toast({
        title: "Delete not yet available",
        description: "Template deletion endpoint is being implemented",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete template",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Card className="hover-elevate transition-all">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <Badge variant="outline" className="text-xs">
                {template.document_type}
              </Badge>
            </div>
            <CardTitle className="text-base truncate">
              {template.document_type} Template
            </CardTitle>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Field Count */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Fields</span>
          <span className="font-medium">{template.field_count}</span>
        </div>

        {/* Usage Stats */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Matches</span>
          <span className="font-medium">{totalMatches}</span>
        </div>

        {/* Success Rate */}
        {totalMatches > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Success Rate</span>
              <span className="font-medium text-green-600">
                {successRate.toFixed(0)}%
              </span>
            </div>
            <Progress value={successRate} className="h-2" />
          </div>
        )}

        {/* Last Used */}
        {template.last_used_at && (
          <div className="text-xs text-muted-foreground border-t pt-3">
            Last used{" "}
            {formatDistanceToNow(new Date(template.last_used_at), {
              addSuffix: true,
            })}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            title="View template details"
          >
            <Eye className="h-4 w-4 mr-1" />
            View
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Template</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this {template.document_type}{" "}
                  template? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteMutation.mutate()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? "Deleting..." : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}
