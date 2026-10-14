import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SignaturePad } from "@/components/SignaturePad";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Form as FormType, Profile, UsageSummary } from "@shared/schema";
import { getPlanDisplayName, getPlanConfig, type PlanTier } from "@shared/pricing";
import { format, formatDistanceToNow } from "date-fns";
import {
  FileText,
  Download,
  User,
  CreditCard,
  Loader2,
  Save,
  Clock,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Plus,
  Calendar,
  Zap,
  Trash2,
  Star,
  Copy,
  Users,
  UserPlus,
  Database,
} from "lucide-react";

const profileSchema = z.object({
  label: z.string().optional(),
  fullName: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  dateOfBirth: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  country: z.string().optional(),
  employer: z.string().optional(),
  jobTitle: z.string().optional(),
  ssn: z.string().optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export default function Dashboard() {
  const { toast } = useToast();
  const { user, isPro, isLoading: authLoading, tier } = useAuth();
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [newProfileDialogOpen, setNewProfileDialogOpen] = useState(false);
  const [newProfileLabel, setNewProfileLabel] = useState("");

  const planConfig = tier ? getPlanConfig(tier as PlanTier) : null;
  const planDisplayName = tier ? getPlanDisplayName(tier as PlanTier) : "Free";
  const supportsMultipleProfiles = tier === "pro_plus" || tier === "team";

  const { data: profiles, isLoading: profilesLoading } = useQuery<Profile[]>({
    queryKey: ["/api/profiles"],
    enabled: isPro,
  });

  const { data: forms, isLoading: formsLoading } = useQuery<FormType[]>({
    queryKey: ["/api/forms"],
    enabled: isPro,
  });

  const { data: usage, isLoading: usageLoading } = useQuery<UsageSummary>({
    queryKey: ["/api/usage"],
    enabled: isPro,
  });

  const selectedProfile = profiles?.find(p => p.id === selectedProfileId);

  useEffect(() => {
    if (profiles && profiles.length > 0 && !selectedProfileId) {
      const defaultProfile = profiles.find(p => p.isDefault) || profiles[0];
      setSelectedProfileId(defaultProfile.id);
    }
  }, [profiles, selectedProfileId]);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      label: "",
      fullName: "",
      email: "",
      phone: "",
      dateOfBirth: "",
      address: "",
      city: "",
      state: "",
      zipCode: "",
      country: "",
      employer: "",
      jobTitle: "",
      ssn: "",
    },
  });

  useEffect(() => {
    if (selectedProfile && !form.formState.isDirty) {
      form.reset({
        label: selectedProfile.label || "",
        fullName: selectedProfile.fullName || "",
        email: selectedProfile.email || "",
        phone: selectedProfile.phone || "",
        dateOfBirth: selectedProfile.dateOfBirth || "",
        address: selectedProfile.address || "",
        city: selectedProfile.city || "",
        state: selectedProfile.state || "",
        zipCode: selectedProfile.zipCode || "",
        country: selectedProfile.country || "",
        employer: selectedProfile.employer || "",
        jobTitle: selectedProfile.jobTitle || "",
        ssn: selectedProfile.ssn || "",
      });
      if (selectedProfile.signatureData && !signatureData) {
        setSignatureData(selectedProfile.signatureData);
      }
    }
  }, [selectedProfile, form, signatureData]);

  const createProfileMutation = useMutation({
    mutationFn: async (label: string) => {
      const res = await apiRequest("POST", "/api/profiles", { label });
      return res.json();
    },
    onSuccess: (data: unknown) => {
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"] });
      setNewProfileDialogOpen(false);
      setNewProfileLabel("");
      toast({
        title: "Profile created",
        description: "Your new profile has been created.",
      });
      if (data && typeof data === 'object' && 'id' in data) {
        setSelectedProfileId((data as { id: string }).id);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create profile",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const saveProfileMutation = useMutation({
    mutationFn: async (data: ProfileFormValues) => {
      if (!selectedProfileId) {
        const result = await apiRequest("POST", "/api/profiles", {
          ...data,
          signatureData,
          label: data.label || "My Profile",
        });
        return result;
      }
      return apiRequest("PUT", `/api/profiles/${selectedProfileId}`, {
        ...data,
        signatureData,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"] });
      toast({
        title: "Profile saved",
        description: "Your autofill information has been updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to save profile",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (profileId: string) => {
      return apiRequest("POST", `/api/profiles/${profileId}/default`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"] });
      toast({
        title: "Default profile updated",
        description: "This profile will be used for autofill by default.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to set default",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteProfileMutation = useMutation({
    mutationFn: async (profileId: string) => {
      return apiRequest("DELETE", `/api/profiles/${profileId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"] });
      setSelectedProfileId(null);
      toast({
        title: "Profile deleted",
        description: "The profile has been removed.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete profile",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const duplicateProfileMutation = useMutation({
    mutationFn: async (profileId: string) => {
      const profileToDupe = profiles?.find(p => p.id === profileId);
      if (!profileToDupe) throw new Error("Profile not found");
      
      const res = await apiRequest("POST", "/api/profiles", {
        label: `${profileToDupe.label || "Profile"} (Copy)`,
        fullName: profileToDupe.fullName,
        email: profileToDupe.email,
        phone: profileToDupe.phone,
        dateOfBirth: profileToDupe.dateOfBirth,
        address: profileToDupe.address,
        city: profileToDupe.city,
        state: profileToDupe.state,
        zipCode: profileToDupe.zipCode,
        country: profileToDupe.country,
        employer: profileToDupe.employer,
        jobTitle: profileToDupe.jobTitle,
        ssn: profileToDupe.ssn,
        signatureData: profileToDupe.signatureData,
      });
      return res.json();
    },
    onSuccess: (data: unknown) => {
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"] });
      toast({
        title: "Profile duplicated",
        description: "A copy of the profile has been created.",
      });
      if (data && typeof data === 'object' && 'id' in data) {
        setSelectedProfileId((data as { id: string }).id);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to duplicate profile",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ProfileFormValues) => {
    saveProfileMutation.mutate(data);
  };

  const handleCreateProfile = () => {
    if (newProfileLabel.trim()) {
      createProfileMutation.mutate(newProfileLabel.trim());
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-muted/20">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-12">
          <div className="max-w-4xl mx-auto">
            <Skeleton className="h-10 w-48 mb-8" />
            <div className="grid gap-6 md:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-32" />
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
            <h1 className="text-2xl font-bold">Subscribe to Access Dashboard</h1>
            <p className="text-muted-foreground">
              Get access to your dashboard, saved profiles, autofill, and form history with a subscription plan.
            </p>
            <Button asChild data-testid="button-upgrade">
              <Link href="/#pricing">
                View Plans — Starting at $7/mo
              </Link>
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
        <div className="max-w-5xl mx-auto space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Dashboard</h1>
              <p className="text-muted-foreground">
                Manage your profiles and view your forms
              </p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" asChild>
                <Link href="/batch-fill">
                  <Database className="mr-2 h-4 w-4" />
                  Batch Fill
                </Link>
              </Button>
              <Button asChild data-testid="button-new-form">
                <Link href="/upload">
                  <Plus className="mr-2 h-4 w-4" />
                  New Form
                </Link>
              </Button>
            </div>
          </div>

          {usage && (
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                  <CardTitle className="text-sm font-medium">Forms This Month</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{usage.formsUsed} / {usage.formsIncluded}</div>
                  <Progress value={(usage.formsUsed / usage.formsIncluded) * 100} className="mt-2 h-2" />
                  <p className="text-xs text-muted-foreground mt-2">
                    {usage.formsRemaining} remaining
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                  <CardTitle className="text-sm font-medium">Billing Period</CardTitle>
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{usage.daysRemaining} days</div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Resets {format(new Date(usage.periodEnd), "MMM d, yyyy")}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                  <CardTitle className="text-sm font-medium">Plan</CardTitle>
                  <Zap className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold">
                      {planDisplayName}
                    </span>
                    <Badge>Active</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {planConfig?.pricePerMonth || "$7/month"}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          <Tabs defaultValue="forms" className="space-y-6">
            <TabsList className="grid w-full max-w-md grid-cols-3">
              <TabsTrigger value="forms" data-testid="tab-forms">
                <FileText className="mr-2 h-4 w-4" />
                Forms
              </TabsTrigger>
              <TabsTrigger value="profile" data-testid="tab-profile">
                <User className="mr-2 h-4 w-4" />
                Profiles
              </TabsTrigger>
              <TabsTrigger value="billing" data-testid="tab-billing">
                <CreditCard className="mr-2 h-4 w-4" />
                Billing
              </TabsTrigger>
            </TabsList>

            <TabsContent value="forms" className="space-y-4">
              {formsLoading ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-32" />
                  ))}
                </div>
              ) : forms && forms.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {forms.map((formItem) => (
                    <Card key={formItem.id} className="hover-elevate transition-all">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-4">
                          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <FileText className="h-5 w-5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{formItem.fileName}</p>
                            <p className="text-sm text-muted-foreground">
                              {formItem.createdAt
                                ? formatDistanceToNow(new Date(formItem.createdAt), { addSuffix: true })
                                : "Unknown date"}
                            </p>
                            <div className="flex items-center gap-2 mt-2">
                              {formItem.status === "completed" ? (
                                <Badge variant="secondary" className="text-xs">
                                  <CheckCircle2 className="mr-1 h-3 w-3" />
                                  Completed
                                </Badge>
                              ) : formItem.status === "processing" ? (
                                <Badge variant="secondary" className="text-xs">
                                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                  Processing
                                </Badge>
                              ) : formItem.status === "error" ? (
                                <Badge variant="destructive" className="text-xs">
                                  <AlertCircle className="mr-1 h-3 w-3" />
                                  Error
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs">
                                  <Clock className="mr-1 h-3 w-3" />
                                  In Progress
                                </Badge>
                              )}
                            </div>
                          </div>
                          {formItem.status === "completed" && formItem.generatedPdfPath && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => window.open(`/api/forms/${formItem.id}/download`, "_blank")}
                              data-testid={`button-download-${formItem.id}`}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card className="border-dashed">
                  <CardContent className="p-12 text-center">
                    <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="font-medium mb-2">No forms yet</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Upload your first form to get started
                    </p>
                    <Button asChild>
                      <Link href="/upload">Upload Form</Link>
                    </Button>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="profile" className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        Autofill Profiles
                      </CardTitle>
                      <CardDescription>
                        {supportsMultipleProfiles 
                          ? "Manage multiple profiles for different use cases"
                          : "Save your information for instant autofill on future forms"}
                      </CardDescription>
                    </div>
                    
                    {supportsMultipleProfiles && (
                      <Dialog open={newProfileDialogOpen} onOpenChange={setNewProfileDialogOpen}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" data-testid="button-new-profile">
                            <UserPlus className="mr-2 h-4 w-4" />
                            New Profile
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Create New Profile</DialogTitle>
                            <DialogDescription>
                              Give your new profile a name to help you identify it.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                            <div className="space-y-2">
                              <Label htmlFor="profileLabel">Profile Name</Label>
                              <Input
                                id="profileLabel"
                                placeholder="e.g., Personal, Work, Spouse"
                                value={newProfileLabel}
                                onChange={(e) => setNewProfileLabel(e.target.value)}
                                data-testid="input-new-profile-label"
                              />
                            </div>
                          </div>
                          <DialogFooter>
                            <Button
                              onClick={handleCreateProfile}
                              disabled={!newProfileLabel.trim() || createProfileMutation.isPending}
                              data-testid="button-create-profile"
                            >
                              {createProfileMutation.isPending ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Creating...
                                </>
                              ) : (
                                "Create Profile"
                              )}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>
                </CardHeader>
                
                {supportsMultipleProfiles && profiles && profiles.length > 1 && (
                  <CardContent className="border-t pt-4 pb-0">
                    <div className="flex items-center gap-4 flex-wrap">
                      <Label className="text-sm">Select Profile:</Label>
                      <Select
                        value={selectedProfileId || ""}
                        onValueChange={setSelectedProfileId}
                      >
                        <SelectTrigger className="w-[200px]" data-testid="select-profile">
                          <SelectValue placeholder="Choose a profile" />
                        </SelectTrigger>
                        <SelectContent>
                          {profiles.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              <span className="flex items-center gap-2">
                                {p.label || "Unnamed Profile"}
                                {p.isDefault && (
                                  <Star className="h-3 w-3 text-primary fill-primary" />
                                )}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      
                      {selectedProfile && !selectedProfile.isDefault && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDefaultMutation.mutate(selectedProfileId!)}
                          disabled={setDefaultMutation.isPending}
                          data-testid="button-set-default"
                        >
                          <Star className="mr-1 h-3 w-3" />
                          Set as Default
                        </Button>
                      )}
                      
                      {selectedProfile && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => duplicateProfileMutation.mutate(selectedProfileId!)}
                          disabled={duplicateProfileMutation.isPending}
                          data-testid="button-duplicate-profile"
                        >
                          <Copy className="mr-1 h-3 w-3" />
                          Duplicate
                        </Button>
                      )}
                      
                      {selectedProfile && profiles.length > 1 && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              data-testid="button-delete-profile"
                            >
                              <Trash2 className="mr-1 h-3 w-3" />
                              Delete
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Profile</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete "{selectedProfile.label}"? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteProfileMutation.mutate(selectedProfileId!)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </CardContent>
                )}
                
                <CardContent className="pt-6">
                  {profilesLoading ? (
                    <div className="space-y-4">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-10 w-full" />
                      ))}
                    </div>
                  ) : (selectedProfile || !supportsMultipleProfiles || (profiles && profiles.length === 0)) ? (
                    <Form {...form}>
                      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        <FormField
                          control={form.control}
                          name="label"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Profile Name</FormLabel>
                              <FormControl>
                                <Input placeholder="Personal" {...field} data-testid="input-profile-label" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <Separator />
                        
                        <div className="grid gap-4 md:grid-cols-2">
                          <FormField
                            control={form.control}
                            name="fullName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Full Name</FormLabel>
                                <FormControl>
                                  <Input placeholder="John Doe" {...field} data-testid="input-fullname" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="email"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Email</FormLabel>
                                <FormControl>
                                  <Input type="email" placeholder="john@autofillpdf.com" {...field} data-testid="input-email" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="phone"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Phone</FormLabel>
                                <FormControl>
                                  <Input placeholder="(555) 123-4567" {...field} data-testid="input-phone" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="dateOfBirth"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Date of Birth</FormLabel>
                                <FormControl>
                                  <Input type="date" {...field} data-testid="input-dob" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <Separator />

                        <div className="space-y-4">
                          <FormField
                            control={form.control}
                            name="address"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Address</FormLabel>
                                <FormControl>
                                  <Input placeholder="123 Main St" {...field} data-testid="input-address" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <div className="grid gap-4 md:grid-cols-3">
                            <FormField
                              control={form.control}
                              name="city"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>City</FormLabel>
                                  <FormControl>
                                    <Input placeholder="New York" {...field} data-testid="input-city" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="state"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>State</FormLabel>
                                  <FormControl>
                                    <Input placeholder="NY" {...field} data-testid="input-state" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="zipCode"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>ZIP Code</FormLabel>
                                  <FormControl>
                                    <Input placeholder="10001" {...field} data-testid="input-zip" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>

                        <Separator />

                        <div className="grid gap-4 md:grid-cols-2">
                          <FormField
                            control={form.control}
                            name="employer"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Employer</FormLabel>
                                <FormControl>
                                  <Input placeholder="Company Name" {...field} data-testid="input-employer" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="jobTitle"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Job Title</FormLabel>
                                <FormControl>
                                  <Input placeholder="Software Engineer" {...field} data-testid="input-jobtitle" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <Separator />

                        <SignaturePad
                          onSignatureChange={setSignatureData}
                          initialSignature={signatureData}
                        />

                        <Button
                          type="submit"
                          disabled={saveProfileMutation.isPending}
                          className="w-full md:w-auto"
                          data-testid="button-save-profile"
                        >
                          {saveProfileMutation.isPending ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <Save className="mr-2 h-4 w-4" />
                              Save Profile
                            </>
                          )}
                        </Button>
                      </form>
                    </Form>
                  ) : (
                    <div className="text-center py-8">
                      <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="font-medium mb-2">No profile selected</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Create a new profile or select an existing one to edit.
                      </p>
                      <Button onClick={() => setNewProfileDialogOpen(true)}>
                        <UserPlus className="mr-2 h-4 w-4" />
                        Create Profile
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
              
              {!supportsMultipleProfiles && (
                <Card className="bg-primary/5 border-primary/20">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Users className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-medium">Want multiple profiles?</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          Upgrade to Pro+ or Enterprise to create unlimited profiles for different use cases (personal, work, spouse, etc.)
                        </p>
                        <Button variant="outline" size="sm" className="mt-3">
                          Learn More
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="billing" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Subscription</CardTitle>
                  <CardDescription>
                    Manage your subscription
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Zap className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">
                          {planDisplayName} Plan
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {planConfig?.pricePerMonth || "$7/month"}
                        </p>
                      </div>
                    </div>
                    <Badge variant="default">Active</Badge>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <p className="text-sm font-medium">Plan Features</p>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                        {planConfig?.formsIncluded || 2} forms included per month
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                        Autofill from saved profile
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                        Saved digital signature
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                        180-day form history
                      </li>
                      {supportsMultipleProfiles && (
                        <li className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                          Multiple autofill profiles
                        </li>
                      )}
                    </ul>
                  </div>

                  <Separator />

                  <div className="flex gap-3">
                    <Button variant="outline" asChild>
                      <a href="/api/stripe/portal">Manage Subscription</a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <Footer />
    </div>
  );
}
