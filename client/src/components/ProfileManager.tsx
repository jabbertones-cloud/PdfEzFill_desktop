import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Star, Trash2, Edit2, User } from "lucide-react";
import type { Profile } from "@shared/schema";

interface ProfileFormData {
  label: string;
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  employer: string;
  jobTitle: string;
}

const emptyForm: ProfileFormData = {
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
};

export function ProfileManager() {
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [formData, setFormData] = useState<ProfileFormData>(emptyForm);

  const { data: profiles = [], isLoading } = useQuery<Profile[]>({
    queryKey: ["/api/profiles"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: ProfileFormData) => {
      const res = await apiRequest("POST", "/api/profiles", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Profile created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"] });
      setCreateDialogOpen(false);
      setFormData(emptyForm);
    },
    onError: (error: any) => {
      toast({ title: error.message || "Failed to create profile", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ProfileFormData }) => {
      const res = await apiRequest("PUT", `/api/profiles/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Profile updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"] });
      setEditDialogOpen(false);
      setSelectedProfile(null);
      setFormData(emptyForm);
    },
    onError: () => {
      toast({ title: "Failed to update profile", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/profiles/${id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Profile deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"] });
    },
    onError: (error: any) => {
      toast({ title: error.message || "Failed to delete profile", variant: "destructive" });
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/profiles/${id}/default`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Default profile updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"] });
    },
    onError: () => {
      toast({ title: "Failed to set default profile", variant: "destructive" });
    },
  });

  const openEditDialog = (profile: Profile) => {
    setSelectedProfile(profile);
    setFormData({
      label: profile.label || "",
      fullName: profile.fullName || "",
      email: profile.email || "",
      phone: profile.phone || "",
      dateOfBirth: profile.dateOfBirth || "",
      address: profile.address || "",
      city: profile.city || "",
      state: profile.state || "",
      zipCode: profile.zipCode || "",
      country: profile.country || "",
      employer: profile.employer || "",
      jobTitle: profile.jobTitle || "",
    });
    setEditDialogOpen(true);
  };

  const handleInputChange = (field: keyof ProfileFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const ProfileForm = ({ onSubmit, submitLabel }: { onSubmit: () => void; submitLabel: string }) => (
    <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="label">Profile Label</Label>
          <Input
            id="label"
            value={formData.label}
            onChange={(e) => handleInputChange("label", e.target.value)}
            placeholder="e.g., Personal, Work, Spouse"
            data-testid="input-profile-label"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fullName">Full Name</Label>
          <Input
            id="fullName"
            value={formData.fullName}
            onChange={(e) => handleInputChange("fullName", e.target.value)}
            data-testid="input-profile-fullname"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => handleInputChange("email", e.target.value)}
            data-testid="input-profile-email"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            type="tel"
            value={formData.phone}
            onChange={(e) => handleInputChange("phone", e.target.value)}
            data-testid="input-profile-phone"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="dateOfBirth">Date of Birth</Label>
        <Input
          id="dateOfBirth"
          type="date"
          value={formData.dateOfBirth}
          onChange={(e) => handleInputChange("dateOfBirth", e.target.value)}
          data-testid="input-profile-dob"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="address">Street Address</Label>
        <Input
          id="address"
          value={formData.address}
          onChange={(e) => handleInputChange("address", e.target.value)}
          data-testid="input-profile-address"
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="city">City</Label>
          <Input
            id="city"
            value={formData.city}
            onChange={(e) => handleInputChange("city", e.target.value)}
            data-testid="input-profile-city"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="state">State</Label>
          <Input
            id="state"
            value={formData.state}
            onChange={(e) => handleInputChange("state", e.target.value)}
            data-testid="input-profile-state"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="zipCode">ZIP Code</Label>
          <Input
            id="zipCode"
            value={formData.zipCode}
            onChange={(e) => handleInputChange("zipCode", e.target.value)}
            data-testid="input-profile-zip"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="country">Country</Label>
        <Input
          id="country"
          value={formData.country}
          onChange={(e) => handleInputChange("country", e.target.value)}
          data-testid="input-profile-country"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="employer">Employer</Label>
          <Input
            id="employer"
            value={formData.employer}
            onChange={(e) => handleInputChange("employer", e.target.value)}
            data-testid="input-profile-employer"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="jobTitle">Job Title</Label>
          <Input
            id="jobTitle"
            value={formData.jobTitle}
            onChange={(e) => handleInputChange("jobTitle", e.target.value)}
            data-testid="input-profile-jobtitle"
          />
        </div>
      </div>

      <DialogFooter className="mt-4">
        <Button onClick={onSubmit} data-testid="button-save-profile">
          {submitLabel}
        </Button>
      </DialogFooter>
    </div>
  );

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle>Profiles</CardTitle>
          <CardDescription>Manage autofill profiles for your forms</CardDescription>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid="button-add-profile">
              <Plus className="h-4 w-4 mr-1" />
              Add Profile
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Profile</DialogTitle>
              <DialogDescription>
                Add a new autofill profile for quick form completion
              </DialogDescription>
            </DialogHeader>
            <ProfileForm
              onSubmit={() => createMutation.mutate(formData)}
              submitLabel={createMutation.isPending ? "Creating..." : "Create Profile"}
            />
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {profiles.length === 0 ? (
          <div className="text-center py-8">
            <User className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-medium mb-2">No profiles yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create a profile to enable autofill on your forms
            </p>
            <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-first-profile">
              <Plus className="h-4 w-4 mr-1" />
              Create Your First Profile
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {profiles.map((profile) => (
              <div
                key={profile.id}
                className="flex items-center justify-between p-4 border rounded-lg"
                data-testid={`profile-card-${profile.id}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{profile.label || "Default"}</span>
                      {profile.isDefault && (
                        <Badge variant="secondary">
                          <Star className="h-3 w-3 mr-1" />
                          Default
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {profile.fullName || profile.email || "No details"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!profile.isDefault && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDefaultMutation.mutate(profile.id)}
                      disabled={setDefaultMutation.isPending}
                      data-testid={`button-set-default-${profile.id}`}
                    >
                      <Star className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openEditDialog(profile)}
                    data-testid={`button-edit-profile-${profile.id}`}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  {profiles.length > 1 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => deleteMutation.mutate(profile.id)}
                      disabled={deleteMutation.isPending}
                      data-testid={`button-delete-profile-${profile.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
            <DialogDescription>Update your autofill profile information</DialogDescription>
          </DialogHeader>
          <ProfileForm
            onSubmit={() => {
              if (selectedProfile) {
                updateMutation.mutate({ id: selectedProfile.id, data: formData });
              }
            }}
            submitLabel={updateMutation.isPending ? "Saving..." : "Save Changes"}
          />
        </DialogContent>
      </Dialog>
    </Card>
  );
}
