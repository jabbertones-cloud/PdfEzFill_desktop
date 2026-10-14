import { useParams, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { FlowProgress } from "@/components/FlowProgress";
import type { Form } from "@shared/schema";
import {
  Download as DownloadIcon,
  CheckCircle2,
  FileText,
  Clock,
  Sparkles,
  ArrowRight,
  AlertCircle,
  Loader2,
  RefreshCw,
} from "lucide-react";

export default function Download() {
  const { formId } = useParams<{ formId: string }>();
  const [, setLocation] = useLocation();
  const { isPro, isAuthenticated } = useAuth();

  const { data: form, isLoading, error, refetch } = useQuery<Form>({
    queryKey: ["/api/forms", formId],
    enabled: !!formId,
    refetchInterval: (data) => {
      if (data?.state?.data?.status === "processing") {
        return 2000;
      }
      return false;
    },
  });

  const handleDownload = () => {
    window.open(`/api/forms/${formId}/download`, "_blank");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-muted/20">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-12">
          <div className="max-w-lg mx-auto space-y-6">
            <Skeleton className="h-20 w-20 rounded-full mx-auto" />
            <Skeleton className="h-8 w-3/4 mx-auto" />
            <Skeleton className="h-6 w-1/2 mx-auto" />
            <Card>
              <CardContent className="p-6 space-y-4">
                <Skeleton className="h-12 w-full" />
              </CardContent>
            </Card>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (error || !form) {
    return (
      <div className="min-h-screen flex flex-col bg-muted/20">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-12">
          <div className="max-w-lg mx-auto text-center space-y-6">
            <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
              <AlertCircle className="h-10 w-10 text-destructive" />
            </div>
            <h1 className="text-2xl font-bold">We Could Not Find This Form</h1>
            <p className="text-muted-foreground">
              This form may be gone. Try starting a new one.
            </p>
            <Button onClick={() => setLocation("/upload")} data-testid="button-upload-new">
              Start a New Form
            </Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // Processing state
  if (form.status === "processing") {
    return (
      <div className="min-h-screen flex flex-col bg-muted/20">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-12">
          <div className="max-w-lg mx-auto text-center space-y-6">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Loader2 className="h-10 w-10 text-primary animate-spin" />
            </div>
            <h1 className="text-2xl font-bold">Finishing Your Form...</h1>
            <p className="text-muted-foreground">
              We are putting your answers in the right spots. Just a few seconds!
            </p>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-center gap-3">
                  <RefreshCw className="h-5 w-5 text-muted-foreground animate-spin" />
                  <span className="text-muted-foreground">Almost done...</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // Error state
  if (form.status === "error") {
    return (
      <div className="min-h-screen flex flex-col bg-muted/20">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-12">
          <div className="max-w-lg mx-auto text-center space-y-6">
            <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
              <AlertCircle className="h-10 w-10 text-destructive" />
            </div>
            <h1 className="text-2xl font-bold">Oops — Something Did Not Work</h1>
            <p className="text-muted-foreground">
              {form.errorMessage || "We could not make your PDF. Please try again."}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button variant="outline" onClick={() => refetch()} data-testid="button-retry">
                <RefreshCw className="mr-2 h-4 w-4" />
                Try Again
              </Button>
              <Button onClick={() => setLocation("/upload")} data-testid="button-upload-new">
                Start Over
              </Button>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // Success state
  return (
    <div className="min-h-screen flex flex-col bg-muted/20">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="max-w-lg mx-auto text-center space-y-8">
          <FlowProgress current="download" />

          {/* Success icon */}
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-10 w-10 text-primary" />
          </div>

          {/* Title */}
          <div className="space-y-2">
            <h1 className="text-3xl font-bold">Done! Your PDF Is Ready.</h1>
            <p className="text-muted-foreground">
              All your answers are in the right spots.
            </p>
          </div>

          {/* Download card */}
          <Card className="border-2">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-4 text-left">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <FileText className="h-6 w-6 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{form.fileName}</p>
                  <p className="text-sm text-muted-foreground">
                    {form.pageCount} page{form.pageCount !== 1 ? "s" : ""} • Completed
                  </p>
                </div>
              </div>

              <Button
                className="w-full h-12"
                onClick={handleDownload}
                data-testid="button-download"
              >
                <DownloadIcon className="mr-2 h-5 w-5" />
                Save My PDF
              </Button>

              {form.expiresAt && (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>
                    Available until {new Date(form.expiresAt).toLocaleDateString()}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pro upsell for non-Pro users */}
          {!isPro && isAuthenticated && (
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">Fill Forms Even Faster</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <CardDescription className="text-center">
                  Save your info once. Next time, fill forms with one click.
                </CardDescription>
                <Button variant="default" className="w-full" asChild data-testid="button-upgrade-pro">
                  <a href="/api/login">
                    Set Up Quick Fill
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Save to profile for Pro users */}
          {isPro && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center justify-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <span className="font-medium">Good to Know</span>
                </div>
                <p className="text-sm text-muted-foreground text-center">
                  Your info was saved. Next time, click "Fill From Profile" to fill forms in seconds.
                </p>
                <Button variant="outline" asChild data-testid="link-dashboard">
                  <Link href="/dashboard">
                    See My Forms
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Upload another */}
          <Button variant="ghost" asChild data-testid="button-upload-another">
            <Link href="/upload">
              Fill Another Form
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </main>

      <Footer />
    </div>
  );
}
