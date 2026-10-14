import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { 
  Users, 
  FileText, 
  CreditCard, 
  TrendingUp, 
  RefreshCcw, 
  Search,
  DollarSign,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  Mail,
  Plus,
  Edit,
  Trash2,
  Eye,
  Send,
  BarChart3
} from "lucide-react";
import type { User, Form, Payment, EmailTemplate, EmailSequence } from "@shared/schema";

interface AdminStats {
  forms: { total: number; completed: number; failed: number };
  revenue: { total: number; subscriptions: number; oneTime: number };
  users: { total: number; byPlan: Record<string, number> };
}

interface EmailStats {
  sent: number;
  opened: number;
  clicked: number;
  bounced: number;
  failed: number;
  pending: number;
  openRate: number | null;
  clickRate: number | null;
}

interface MetricsData {
  summary: {
    processingSuccessRate: number;
    averageOcrConfidence: number;
    averageProcessingTime: number;
    totalFormsProcessed: number;
    ocrQualityDistribution: { high: number; medium: number; low: number; unusable: number };
  };
  dailyBreakdown: Array<{
    date: string;
    totalForms: number;
    successCount: number;
    failureCount: number;
    successRate: number;
    averageConfidence: number;
    averageProcessingTime: number;
    qualityDistribution: { high: number; medium: number; low: number; unusable: number };
  }>;
}

interface TemplateFormData {
  name: string;
  subject: string;
  htmlContent: string;
  textContent: string;
  type: string;
  isActive: boolean;
}

const initialTemplateForm: TemplateFormData = {
  name: "",
  subject: "",
  htmlContent: "",
  textContent: "",
  type: "transactional",
  isActive: true,
};

export default function Admin() {
  const [, navigate] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [refundDialog, setRefundDialog] = useState<{ open: boolean; paymentId: string | null }>({
    open: false,
    paymentId: null,
  });
  const [refundReason, setRefundReason] = useState("");
  
  const [templateDialog, setTemplateDialog] = useState<{ open: boolean; template: EmailTemplate | null }>({
    open: false,
    template: null,
  });
  const [templateForm, setTemplateForm] = useState<TemplateFormData>(initialTemplateForm);
  const [previewDialog, setPreviewDialog] = useState<{ open: boolean; template: EmailTemplate | null }>({
    open: false,
    template: null,
  });

  const { data: stats, isLoading: statsLoading } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
  });

  const { data: users = [], isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });

  const { data: forms = [], isLoading: formsLoading } = useQuery<Form[]>({
    queryKey: ["/api/admin/forms"],
  });

  const { data: payments = [], isLoading: paymentsLoading } = useQuery<Payment[]>({
    queryKey: ["/api/admin/payments"],
  });

  const { data: emailTemplates = [], isLoading: templatesLoading } = useQuery<EmailTemplate[]>({
    queryKey: ["/api/admin/email/templates"],
  });

  const { data: emailSequences = [], isLoading: sequencesLoading } = useQuery<EmailSequence[]>({
    queryKey: ["/api/admin/email/sequences"],
  });

  const { data: emailStats, isLoading: emailStatsLoading } = useQuery<EmailStats>({
    queryKey: ["/api/admin/email/stats"],
  });

  const { data: metricsData, isLoading: metricsLoading } = useQuery<MetricsData>({
    queryKey: ["/api/admin/metrics"],
  });

  useEffect(() => {
    if (templateDialog.template) {
      setTemplateForm({
        name: templateDialog.template.name || "",
        subject: templateDialog.template.subject || "",
        htmlContent: templateDialog.template.htmlContent || "",
        textContent: templateDialog.template.textContent || "",
        type: templateDialog.template.type || "transactional",
        isActive: templateDialog.template.isActive ?? true,
      });
    } else {
      setTemplateForm(initialTemplateForm);
    }
  }, [templateDialog.template]);

  const refundMutation = useMutation({
    mutationFn: async ({ paymentId, reason }: { paymentId: string; reason: string }) => {
      const res = await apiRequest("POST", `/api/admin/refund/${paymentId}`, { reason });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Refund processed successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      setRefundDialog({ open: false, paymentId: null });
      setRefundReason("");
    },
    onError: () => {
      toast({ title: "Failed to process refund", variant: "destructive" });
    },
  });

  const createTemplateMutation = useMutation({
    mutationFn: async (data: TemplateFormData) => {
      return apiRequest("POST", "/api/admin/email/templates", data);
    },
    onSuccess: () => {
      toast({ title: "Template created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email/templates"] });
      setTemplateDialog({ open: false, template: null });
    },
    onError: () => {
      toast({ title: "Failed to create template", variant: "destructive" });
    },
  });

  const updateTemplateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TemplateFormData> }) => {
      return apiRequest("PATCH", `/api/admin/email/templates/${id}`, data);
    },
    onSuccess: () => {
      toast({ title: "Template updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email/templates"] });
      setTemplateDialog({ open: false, template: null });
    },
    onError: () => {
      toast({ title: "Failed to update template", variant: "destructive" });
    },
  });

  const processQueueMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/admin/email/process-queue", {});
    },
    onSuccess: () => {
      toast({ title: "Email queue processed" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email/stats"] });
    },
    onError: () => {
      toast({ title: "Failed to process queue", variant: "destructive" });
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      return apiRequest("DELETE", `/api/admin/email/templates/${templateId}`, {});
    },
    onSuccess: () => {
      toast({ title: "Template deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email/templates"] });
      setDeleteConfirmDialog({ open: false, templateId: null });
    },
    onError: () => {
      toast({ title: "Failed to delete template", variant: "destructive" });
    },
  });

  const [deleteConfirmDialog, setDeleteConfirmDialog] = useState<{ open: boolean; templateId: string | null }>({
    open: false,
    templateId: null,
  });

  const handleSaveTemplate = () => {
    if (!templateForm.name || !templateForm.subject || !templateForm.htmlContent) {
      toast({ 
        title: "Validation error", 
        description: "Name, subject, and HTML content are required",
        variant: "destructive" 
      });
      return;
    }
    if (templateDialog.template) {
      updateTemplateMutation.mutate({
        id: templateDialog.template.id,
        data: templateForm,
      });
    } else {
      createTemplateMutation.mutate(templateForm);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user?.isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center space-y-4">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
            <h1 className="text-xl font-bold">Access Denied</h1>
            <p className="text-muted-foreground">You don't have admin privileges.</p>
            <Button onClick={() => navigate("/")} data-testid="button-go-home">
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const filteredUsers = users.filter(
    (u) =>
      u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.lastName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredForms = forms.filter(
    (f) =>
      f.fileName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.id.includes(searchTerm)
  );

  const filteredPayments = payments.filter(
    (p) =>
      p.id.includes(searchTerm) ||
      p.stripePaymentIntentId?.includes(searchTerm)
  );

  const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  const formatDate = (date: string | Date | null) =>
    date ? new Date(date).toLocaleDateString() : "N/A";

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
      completed: { variant: "default", icon: CheckCircle },
      pending: { variant: "secondary", icon: Clock },
      failed: { variant: "destructive", icon: XCircle },
      refunded: { variant: "outline", icon: RefreshCcw },
      ready: { variant: "default", icon: CheckCircle },
      processing: { variant: "secondary", icon: Clock },
      error: { variant: "destructive", icon: XCircle },
    };
    const config = variants[status] || variants.pending;
    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {status}
      </Badge>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Admin Dashboard</h1>
            <p className="text-muted-foreground">Manage users, forms, and payments</p>
          </div>
          <Button variant="outline" onClick={() => navigate("/dashboard")} data-testid="button-back-dashboard">
            Back to Dashboard
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-total-users">
                {statsLoading ? "..." : stats?.users.total || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                {stats?.users.byPlan.pro || 0} Pro, {stats?.users.byPlan.pro_plus || 0} Pro+
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium">Total Forms</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-total-forms">
                {statsLoading ? "..." : stats?.forms.total || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                {stats?.forms.completed || 0} completed, {stats?.forms.failed || 0} failed
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-total-revenue">
                {statsLoading ? "..." : formatCurrency(stats?.revenue.total || 0)}
              </div>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(stats?.revenue.subscriptions || 0)} subscriptions
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium">Conversion</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-conversion">
                {statsLoading || !stats?.forms.total
                  ? "..."
                  : `${Math.round((stats.forms.completed / stats.forms.total) * 100)}%`}
              </div>
              <p className="text-xs text-muted-foreground">Form completion rate</p>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users, forms, or payments..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
            data-testid="input-admin-search"
          />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="users" className="space-y-4">
          <TabsList>
            <TabsTrigger value="users" data-testid="tab-users">
              <Users className="h-4 w-4 mr-2" />
              Users ({filteredUsers.length})
            </TabsTrigger>
            <TabsTrigger value="forms" data-testid="tab-forms">
              <FileText className="h-4 w-4 mr-2" />
              Forms ({filteredForms.length})
            </TabsTrigger>
            <TabsTrigger value="payments" data-testid="tab-payments">
              <CreditCard className="h-4 w-4 mr-2" />
              Payments ({filteredPayments.length})
            </TabsTrigger>
            <TabsTrigger value="email" data-testid="tab-email">
              <Mail className="h-4 w-4 mr-2" />
              Email
            </TabsTrigger>
            <TabsTrigger value="metrics" data-testid="tab-metrics">
              <BarChart3 className="h-4 w-4 mr-2" />
              Metrics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle>Users</CardTitle>
                <CardDescription>Manage user accounts and subscriptions</CardDescription>
              </CardHeader>
              <CardContent>
                {usersLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Plan</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Joined</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUsers.map((user) => (
                        <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                          <TableCell>
                            <div>
                              <p className="font-medium">
                                {user.firstName} {user.lastName}
                              </p>
                              <p className="text-sm text-muted-foreground">{user.email}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={user.planType === "none" ? "outline" : "default"}>
                              {user.planType === "pro" ? "Starter" : 
                               user.planType === "pro_plus" ? "Pro+" : 
                               user.planType === "team" ? "Enterprise" : 
                               user.planType}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {user.subscriptionStatus ? (
                              getStatusBadge(user.subscriptionStatus)
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>{formatDate(user.createdAt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="forms">
            <Card>
              <CardHeader>
                <CardTitle>Forms</CardTitle>
                <CardDescription>View and manage all form submissions</CardDescription>
              </CardHeader>
              <CardContent>
                {formsLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>File</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>OCR</TableHead>
                        <TableHead>Paid</TableHead>
                        <TableHead>Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredForms.map((form) => (
                        <TableRow key={form.id} data-testid={`row-form-${form.id}`}>
                          <TableCell>
                            <div>
                              <p className="font-medium truncate max-w-[200px]">{form.fileName}</p>
                              <p className="text-xs text-muted-foreground">{form.pageCount} pages</p>
                            </div>
                          </TableCell>
                          <TableCell>{getStatusBadge(form.status)}</TableCell>
                          <TableCell>
                            {form.ocrConfidence ? (
                              <span
                                className={
                                  form.ocrConfidence > 70
                                    ? "text-green-600"
                                    : form.ocrConfidence > 30
                                    ? "text-yellow-600"
                                    : "text-red-600"
                                }
                              >
                                {Math.round(form.ocrConfidence)}%
                              </span>
                            ) : (
                              "-"
                            )}
                          </TableCell>
                          <TableCell>
                            {form.isPaid ? (
                              <Badge variant="default">Paid</Badge>
                            ) : (
                              <Badge variant="outline">Unpaid</Badge>
                            )}
                          </TableCell>
                          <TableCell>{formatDate(form.createdAt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payments">
            <Card>
              <CardHeader>
                <CardTitle>Payments</CardTitle>
                <CardDescription>View payment history and process refunds</CardDescription>
              </CardHeader>
              <CardContent>
                {paymentsLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPayments.map((payment) => (
                        <TableRow key={payment.id} data-testid={`row-payment-${payment.id}`}>
                          <TableCell className="font-mono text-xs">
                            {payment.id.slice(0, 8)}...
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{payment.type}</Badge>
                          </TableCell>
                          <TableCell>{formatCurrency(payment.amount)}</TableCell>
                          <TableCell>{getStatusBadge(payment.status || "pending")}</TableCell>
                          <TableCell>{formatDate(payment.createdAt)}</TableCell>
                          <TableCell>
                            {payment.status === "completed" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setRefundDialog({ open: true, paymentId: payment.id })
                                }
                                data-testid={`button-refund-${payment.id}`}
                              >
                                <RefreshCcw className="h-3 w-3 mr-1" />
                                Refund
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="email">
            <div className="space-y-6">
              {/* Email Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                    <CardTitle className="text-sm font-medium">Sent</CardTitle>
                    <Send className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="stat-emails-sent">
                      {emailStatsLoading ? "..." : emailStats?.sent ?? 0}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                    <CardTitle className="text-sm font-medium">Opened</CardTitle>
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="stat-emails-opened">
                      {emailStatsLoading ? "..." : emailStats?.opened ?? 0}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {emailStatsLoading ? "" : `${Number.isFinite(emailStats?.openRate) ? (emailStats?.openRate ?? 0).toFixed(1) : "0.0"}%`}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                    <CardTitle className="text-sm font-medium">Clicked</CardTitle>
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="stat-emails-clicked">
                      {emailStatsLoading ? "..." : emailStats?.clicked ?? 0}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {emailStatsLoading ? "" : `${Number.isFinite(emailStats?.clickRate) ? (emailStats?.clickRate ?? 0).toFixed(1) : "0.0"}%`}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                    <CardTitle className="text-sm font-medium">Bounced</CardTitle>
                    <XCircle className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-yellow-600" data-testid="stat-emails-bounced">
                      {emailStatsLoading ? "..." : emailStats?.bounced ?? 0}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                    <CardTitle className="text-sm font-medium">Failed</CardTitle>
                    <AlertCircle className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-destructive" data-testid="stat-emails-failed">
                      {emailStatsLoading ? "..." : emailStats?.failed ?? 0}
                    </div>
                  </CardContent>
                </Card>
                <Card className="col-span-2 md:col-span-1">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                    <CardTitle className="text-sm font-medium">Pending</CardTitle>
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="stat-emails-pending">
                      {emailStatsLoading ? "..." : emailStats?.pending ?? 0}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      onClick={() => processQueueMutation.mutate()}
                      disabled={processQueueMutation.isPending || emailStatsLoading}
                      data-testid="button-process-queue"
                    >
                      {processQueueMutation.isPending ? (
                        <RefreshCcw className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <RefreshCcw className="h-3 w-3 mr-1" />
                      )}
                      {processQueueMutation.isPending ? "Processing..." : "Process"}
                    </Button>
                  </CardContent>
                </Card>
              </div>

              {/* Templates Section */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2">
                  <div>
                    <CardTitle>Email Templates</CardTitle>
                    <CardDescription>Manage email templates for automation</CardDescription>
                  </div>
                  <Button
                    onClick={() => setTemplateDialog({ open: true, template: null })}
                    data-testid="button-new-template"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    New Template
                  </Button>
                </CardHeader>
                <CardContent>
                  {templatesLoading ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                    </div>
                  ) : emailTemplates.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No email templates yet</p>
                      <p className="text-sm">Create a template to get started</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Subject</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {emailTemplates.map((template) => (
                          <TableRow key={template.id} data-testid={`row-template-${template.id}`}>
                            <TableCell className="font-medium">{template.name}</TableCell>
                            <TableCell className="max-w-[200px] truncate">
                              {template.subject}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{template.type}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={template.isActive ? "default" : "secondary"}>
                                {template.isActive ? "Active" : "Inactive"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => setPreviewDialog({ open: true, template })}
                                  data-testid={`button-preview-${template.id}`}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => setTemplateDialog({ open: true, template })}
                                  data-testid={`button-edit-${template.id}`}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => setDeleteConfirmDialog({ open: true, templateId: template.id })}
                                  data-testid={`button-delete-${template.id}`}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              {/* Sequences Section */}
              <Card>
                <CardHeader>
                  <CardTitle>Email Sequences</CardTitle>
                  <CardDescription>Automated email drip campaigns</CardDescription>
                </CardHeader>
                <CardContent>
                  {sequencesLoading ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                    </div>
                  ) : emailSequences.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No email sequences yet</p>
                      <p className="text-sm">Sequences allow multi-step email campaigns</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Trigger</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Created</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {emailSequences.map((sequence) => (
                          <TableRow key={sequence.id} data-testid={`row-sequence-${sequence.id}`}>
                            <TableCell className="font-medium">{sequence.name}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{sequence.triggerType}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={sequence.isActive ? "default" : "secondary"}>
                                {sequence.isActive ? "Active" : "Inactive"}
                              </Badge>
                            </TableCell>
                            <TableCell>{formatDate(sequence.createdAt)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="metrics">
            <div className="space-y-6">
              {metricsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Eye className="h-5 w-5" />
                          OCR Quality Metrics
                        </CardTitle>
                        <CardDescription>Document scanning quality analysis</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Average Confidence</span>
                            <span className="text-2xl font-bold" data-testid="stat-avg-confidence">
                              {metricsData?.summary.averageOcrConfidence?.toFixed(1) ?? "0"}%
                            </span>
                          </div>
                        </div>
                        <div className="space-y-3">
                          <span className="text-sm font-medium">Quality Distribution</span>
                          {(() => {
                            const dist = metricsData?.summary.ocrQualityDistribution ?? { high: 0, medium: 0, low: 0, unusable: 0 };
                            const total = dist.high + dist.medium + dist.low + dist.unusable;
                            return (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs w-20">High</span>
                                  <Progress value={total > 0 ? (dist.high / total) * 100 : 0} className="flex-1 h-2" />
                                  <span className="text-xs text-muted-foreground w-16 text-right">
                                    {dist.high} ({total > 0 ? ((dist.high / total) * 100).toFixed(0) : 0}%)
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs w-20">Medium</span>
                                  <Progress value={total > 0 ? (dist.medium / total) * 100 : 0} className="flex-1 h-2" />
                                  <span className="text-xs text-muted-foreground w-16 text-right">
                                    {dist.medium} ({total > 0 ? ((dist.medium / total) * 100).toFixed(0) : 0}%)
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs w-20">Low</span>
                                  <Progress value={total > 0 ? (dist.low / total) * 100 : 0} className="flex-1 h-2" />
                                  <span className="text-xs text-muted-foreground w-16 text-right">
                                    {dist.low} ({total > 0 ? ((dist.low / total) * 100).toFixed(0) : 0}%)
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs w-20">Unusable</span>
                                  <Progress value={total > 0 ? (dist.unusable / total) * 100 : 0} className="flex-1 h-2" />
                                  <span className="text-xs text-muted-foreground w-16 text-right">
                                    {dist.unusable} ({total > 0 ? ((dist.unusable / total) * 100).toFixed(0) : 0}%)
                                  </span>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <TrendingUp className="h-5 w-5" />
                          Processing Metrics
                        </CardTitle>
                        <CardDescription>Form processing performance</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 gap-4">
                          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                            <span className="text-sm font-medium">Success Rate</span>
                            <span className="text-xl font-bold text-green-600" data-testid="stat-success-rate">
                              {metricsData?.summary.processingSuccessRate?.toFixed(1) ?? "0"}%
                            </span>
                          </div>
                          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                            <span className="text-sm font-medium">Total Forms Processed</span>
                            <span className="text-xl font-bold" data-testid="stat-total-processed">
                              {metricsData?.summary.totalFormsProcessed ?? 0}
                            </span>
                          </div>
                          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                            <span className="text-sm font-medium">Avg. Processing Time</span>
                            <span className="text-xl font-bold" data-testid="stat-avg-time">
                              {metricsData?.summary.averageProcessingTime 
                                ? `${(metricsData.summary.averageProcessingTime / 1000).toFixed(1)}s`
                                : "N/A"}
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="h-5 w-5" />
                        Daily Trends (Last 7 Days)
                      </CardTitle>
                      <CardDescription>Processing statistics over time</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {(!metricsData?.dailyBreakdown || metricsData.dailyBreakdown.length === 0) ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>No daily metrics available yet</p>
                        </div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead className="text-right">Forms</TableHead>
                              <TableHead className="text-right">Success</TableHead>
                              <TableHead className="text-right">Failed</TableHead>
                              <TableHead className="text-right">Success Rate</TableHead>
                              <TableHead className="text-right">Avg. Confidence</TableHead>
                              <TableHead className="text-right">Avg. Time</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {metricsData.dailyBreakdown.slice(0, 7).map((day) => (
                              <TableRow key={day.date} data-testid={`row-metric-${day.date}`}>
                                <TableCell className="font-medium">
                                  {new Date(day.date).toLocaleDateString("en-US", { 
                                    weekday: "short", 
                                    month: "short", 
                                    day: "numeric" 
                                  })}
                                </TableCell>
                                <TableCell className="text-right">{day.totalForms}</TableCell>
                                <TableCell className="text-right text-green-600">{day.successCount}</TableCell>
                                <TableCell className="text-right text-red-600">{day.failureCount}</TableCell>
                                <TableCell className="text-right">
                                  <Badge variant={day.successRate >= 90 ? "default" : day.successRate >= 70 ? "secondary" : "destructive"}>
                                    {day.successRate.toFixed(1)}%
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right">{day.averageConfidence.toFixed(1)}%</TableCell>
                                <TableCell className="text-right">
                                  {day.averageProcessingTime ? `${(day.averageProcessingTime / 1000).toFixed(1)}s` : "N/A"}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Refund Dialog */}
        <Dialog open={refundDialog.open} onOpenChange={(open) => setRefundDialog({ open, paymentId: null })}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Process Refund</DialogTitle>
              <DialogDescription>
                This will refund the payment via Stripe. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium">Reason for refund</label>
                <Textarea
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="Enter reason for refund..."
                  className="mt-2"
                  data-testid="input-refund-reason"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setRefundDialog({ open: false, paymentId: null })}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (refundDialog.paymentId) {
                    refundMutation.mutate({
                      paymentId: refundDialog.paymentId,
                      reason: refundReason,
                    });
                  }
                }}
                disabled={refundMutation.isPending}
                data-testid="button-confirm-refund"
              >
                {refundMutation.isPending ? "Processing..." : "Confirm Refund"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Template Editor Dialog */}
        <Dialog 
          open={templateDialog.open} 
          onOpenChange={(open) => setTemplateDialog({ open, template: null })}
        >
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {templateDialog.template ? "Edit Template" : "Create Template"}
              </DialogTitle>
              <DialogDescription>
                {templateDialog.template 
                  ? "Update the email template settings and content" 
                  : "Create a new email template for automation"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="template-name">Template Name</Label>
                  <Input
                    id="template-name"
                    value={templateForm.name}
                    onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                    placeholder="e.g., Welcome Email"
                    data-testid="input-template-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="template-type">Type</Label>
                  <Select
                    value={templateForm.type}
                    onValueChange={(value) => setTemplateForm({ ...templateForm, type: value })}
                  >
                    <SelectTrigger id="template-type" data-testid="select-template-type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="transactional">Transactional</SelectItem>
                      <SelectItem value="marketing">Marketing</SelectItem>
                      <SelectItem value="onboarding">Onboarding</SelectItem>
                      <SelectItem value="notification">Notification</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="template-subject">Subject Line</Label>
                <Input
                  id="template-subject"
                  value={templateForm.subject}
                  onChange={(e) => setTemplateForm({ ...templateForm, subject: e.target.value })}
                  placeholder="e.g., Welcome to AutoFillPDF!"
                  data-testid="input-template-subject"
                />
                <p className="text-xs text-muted-foreground">
                  Use variables like {"{{name}}"} for personalization
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="template-html">HTML Content</Label>
                <Textarea
                  id="template-html"
                  value={templateForm.htmlContent}
                  onChange={(e) => setTemplateForm({ ...templateForm, htmlContent: e.target.value })}
                  placeholder="<h1>Hello {{name}}!</h1><p>Welcome to AutoFillPDF...</p>"
                  rows={8}
                  className="font-mono text-sm"
                  data-testid="input-template-html"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="template-text">Plain Text Content (optional)</Label>
                <Textarea
                  id="template-text"
                  value={templateForm.textContent}
                  onChange={(e) => setTemplateForm({ ...templateForm, textContent: e.target.value })}
                  placeholder="Hello {{name}}! Welcome to AutoFillPDF..."
                  rows={4}
                  data-testid="input-template-text"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="template-active">Active</Label>
                  <p className="text-xs text-muted-foreground">Enable this template for use</p>
                </div>
                <Switch
                  id="template-active"
                  checked={templateForm.isActive}
                  onCheckedChange={(checked) => setTemplateForm({ ...templateForm, isActive: checked })}
                  data-testid="switch-template-active"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setTemplateDialog({ open: false, template: null })}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveTemplate}
                disabled={createTemplateMutation.isPending || updateTemplateMutation.isPending}
                data-testid="button-save-template"
              >
                {(createTemplateMutation.isPending || updateTemplateMutation.isPending) 
                  ? "Saving..." 
                  : templateDialog.template ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Template Preview Dialog */}
        <Dialog 
          open={previewDialog.open} 
          onOpenChange={(open) => setPreviewDialog({ open, template: null })}
        >
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Template Preview</DialogTitle>
              <DialogDescription>
                Preview of "{previewDialog.template?.name}"
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="flex gap-2 items-center">
                <span className="text-sm font-medium">Subject:</span>
                <span className="text-sm">{previewDialog.template?.subject}</span>
              </div>
              <div className="border rounded-lg p-4 bg-white dark:bg-gray-950">
                {previewDialog.template?.htmlContent ? (
                  <div 
                    dangerouslySetInnerHTML={{ 
                      __html: previewDialog.template.htmlContent 
                    }}
                    className="prose dark:prose-invert max-w-none"
                  />
                ) : (
                  <p className="text-muted-foreground italic">No HTML content</p>
                )}
              </div>
              {previewDialog.template?.textContent && (
                <div className="space-y-2">
                  <span className="text-sm font-medium">Plain Text Version:</span>
                  <pre className="text-xs bg-muted p-4 rounded-lg whitespace-pre-wrap">
                    {previewDialog.template.textContent}
                  </pre>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setPreviewDialog({ open: false, template: null })}
              >
                Close
              </Button>
              <Button
                onClick={() => {
                  setPreviewDialog({ open: false, template: null });
                  setTemplateDialog({ open: true, template: previewDialog.template });
                }}
                data-testid="button-edit-from-preview"
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog 
          open={deleteConfirmDialog.open} 
          onOpenChange={(open) => setDeleteConfirmDialog({ open, templateId: null })}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Template</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this email template? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeleteConfirmDialog({ open: false, templateId: null })}
                disabled={deleteTemplateMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (deleteConfirmDialog.templateId && !deleteTemplateMutation.isPending) {
                    deleteTemplateMutation.mutate(deleteConfirmDialog.templateId);
                  }
                }}
                disabled={deleteTemplateMutation.isPending}
                data-testid="button-confirm-delete-template"
              >
                {deleteTemplateMutation.isPending ? "Deleting..." : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
