import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { TemplateCard } from "@/components/TemplateCard";
import { TemplateStats } from "@/components/TemplateStats";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import type { FormTemplate } from "@shared/schema";
import { FileText, Plus, Search, Sparkles } from "lucide-react";

export default function Templates() {
  const { toast } = useToast();
  const { user, isPro, isLoading: authLoading } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [documentTypeFilter, setDocumentTypeFilter] = useState<string>("all");

  const { data: templatesResponse, isLoading: templatesLoading } = useQuery<{
    templates: FormTemplate[];
    count: number;
  }>({
    queryKey: ["/api/templates"],
    enabled: isPro,
  });

  const templates = templatesResponse?.templates || [];

  // Get unique document types from templates
  const documentTypes = Array.from(
    new Set(templates.map((t) => t.document_type))
  ).sort();

  // Filter templates based on search and document type
  const filteredTemplates = templates.filter((template) => {
    const matchesSearch =
      !searchQuery ||
      template.document_type.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesDocType =
      documentTypeFilter === "all" ||
      template.document_type === documentTypeFilter;

    return matchesSearch && matchesDocType;
  });

  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-muted/20">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-12">
          <div className="max-w-6xl mx-auto">
            <Skeleton className="h-10 w-48 mb-8" />
            <div className="grid gap-6 md:grid-cols-3 mb-8">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-48" />
              ))}
            </div>
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
              <Sparkles className="h-10 w-10 text-primary" />
            </div>
            <h1 className="text-2xl font-bold">Subscribe to Access Templates</h1>
            <p className="text-muted-foreground">
              Get access to your template library and smart template matching with a subscription plan.
            </p>
            <Button asChild>
              <Link href="/#pricing">View Plans — Starting at $7/mo</Link>
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
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Templates</h1>
              <p className="text-muted-foreground">
                Manage and view your form templates
              </p>
            </div>
            <Button asChild>
              <Link href="/upload">
                <Plus className="mr-2 h-4 w-4" />
                New Form
              </Link>
            </Button>
          </div>

          {/* Stats Section */}
          {templatesLoading ? (
            <div className="grid gap-4 md:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
          ) : (
            <TemplateStats templates={templates} />
          )}

          {/* Filters Section */}
          {templates.length > 0 && (
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search templates..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              {documentTypes.length > 0 && (
                <Select value={documentTypeFilter} onValueChange={setDocumentTypeFilter}>
                  <SelectTrigger className="w-full md:w-[200px]">
                    <SelectValue placeholder="Filter by type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {documentTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Templates Grid */}
          {templatesLoading ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-48" />
              ))}
            </div>
          ) : filteredTemplates.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filteredTemplates.map((template) => (
                <TemplateCard key={template.id} template={template} />
              ))}
            </div>
          ) : templates.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-12 text-center">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-medium mb-2">No templates yet</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Upload your first form to create a template
                </p>
                <Button asChild>
                  <Link href="/upload">Upload Form</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-dashed">
              <CardContent className="p-12 text-center">
                <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-medium mb-2">No templates found</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Try adjusting your search or filters
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
