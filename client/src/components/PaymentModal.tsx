import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { getPlanDisplayName } from "@shared/pricing";
import type { UsageSummary } from "@shared/schema";
import {
  Check,
  CreditCard,
  Loader2,
  Sparkles,
  Shield,
  Zap,
  AlertCircle,
} from "lucide-react";

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  formId: string;
  onPaymentSuccess: () => void;
}

export function PaymentModal({ isOpen, onClose, formId, onPaymentSuccess }: PaymentModalProps) {
  const { toast } = useToast();
  const { isAuthenticated, isPro, user, tier } = useAuth();
  const planName = tier ? getPlanDisplayName(tier as any) : "Subscriber";
  const [email, setEmail] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<"one_time" | "subscription">("one_time");

  // Fetch usage data for Pro users
  const { data: usage } = useQuery<UsageSummary>({
    queryKey: ["/api/usage"],
    enabled: isPro && isOpen,
  });

  // Check if user has credits remaining
  const hasCreditsRemaining = usage ? usage.formsRemaining > 0 : true;
  const overagePrice = usage?.overagePrice || 200; // default $2

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      // For Pro users without credits, use overage type
      const checkoutType = isPro && !hasCreditsRemaining 
        ? "overage" 
        : (selectedPlan === "subscription" ? "subscription" : "one_time");
      
      const response = await apiRequest("POST", "/api/payments/checkout", {
        formId,
        type: checkoutType,
        tier: selectedPlan === "subscription" ? "starter" : undefined,
        email: !isAuthenticated ? email : undefined,
      });
      return await response.json();
    },
    onSuccess: (data: any) => {
      if (data.url) {
        window.location.href = data.url;
      } else if (data.success) {
        onPaymentSuccess();
        onClose();
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Payment failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCheckout = () => {
    if (!isAuthenticated && selectedPlan === "one_time" && !email) {
      toast({
        title: "Email required",
        description: "Please enter your email for the receipt.",
        variant: "destructive",
      });
      return;
    }
    checkoutMutation.mutate();
  };

  // If user is Pro, show appropriate UI based on credit availability
  if (isPro && user) {
    // Pro user with credits remaining - use included credits
    if (hasCreditsRemaining) {
      return (
        <Dialog open={isOpen} onOpenChange={onClose}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Generate Your PDF</DialogTitle>
              <DialogDescription>
                Use one of your {planName} credits to generate this form.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <Card className="border-primary bg-primary/5">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                        <Sparkles className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{planName} Credit</p>
                        <p className="text-sm text-muted-foreground">
                          {usage?.formsRemaining || 0} of {usage?.formsIncluded || 0} remaining
                        </p>
                      </div>
                    </div>
                    <Badge variant="secondary">Free</Badge>
                  </div>
                </CardContent>
              </Card>

              <Button 
                className="w-full" 
                onClick={handleCheckout}
                disabled={checkoutMutation.isPending}
                data-testid="button-use-credit"
              >
                {checkoutMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Zap className="mr-2 h-4 w-4" />
                    Use {planName} Credit
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      );
    }

    // Pro user with no credits remaining - show overage purchase option
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Purchase Extra Form</DialogTitle>
            <DialogDescription>
              You've used all your included forms this month.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <Card className="border-amber-500/50 bg-amber-500/5">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                    <AlertCircle className="h-5 w-5 text-amber-500" />
                  </div>
                  <div>
                    <p className="font-medium">Monthly credits used</p>
                    <p className="text-sm text-muted-foreground">
                      {usage?.formsUsed || 0} of {usage?.formsIncluded || 0} forms used
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-primary bg-primary/5">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                      <CreditCard className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">Extra Form</p>
                      <p className="text-sm text-muted-foreground">
                        Discounted {planName} rate
                      </p>
                    </div>
                  </div>
                  <span className="text-xl font-bold">${(overagePrice / 100).toFixed(2)}</span>
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Shield className="h-4 w-4" />
              <span>Secure payment via Stripe</span>
            </div>

            <Button 
              className="w-full" 
              onClick={handleCheckout}
              disabled={checkoutMutation.isPending}
              data-testid="button-purchase-extra"
            >
              {checkoutMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Pay ${(overagePrice / 100).toFixed(2)} for Extra Form
                </>
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Credits reset on {usage?.periodEnd ? new Date(usage.periodEnd).toLocaleDateString() : 'next billing date'}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Complete Your Form</DialogTitle>
          <DialogDescription>
            Choose how you'd like to get your completed PDF.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* One-time option */}
          <Card 
            className={`cursor-pointer transition-all ${
              selectedPlan === "one_time" 
                ? "border-primary ring-2 ring-primary/20" 
                : "hover:border-primary/50"
            }`}
            onClick={() => setSelectedPlan("one_time")}
            data-testid="card-option-onetime"
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">One-time</CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold">$5</span>
                  {selectedPlan === "one_time" && (
                    <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                      <Check className="h-3 w-3 text-primary-foreground" />
                    </div>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pb-4">
              <p className="text-sm text-muted-foreground mb-3">
                Download this completed form. No account required.
              </p>
              <ul className="space-y-1.5 text-sm">
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-primary" />
                  Completed PDF download
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-primary" />
                  72-hour access
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Starter option */}
          <Card 
            className={`cursor-pointer transition-all relative ${
              selectedPlan === "subscription" 
                ? "border-primary ring-2 ring-primary/20" 
                : "hover:border-primary/50"
            }`}
            onClick={() => setSelectedPlan("subscription")}
            data-testid="card-option-starter"
          >
            <div className="absolute -top-2.5 left-4">
              <Badge className="px-2 py-0.5 text-xs">Best Value</Badge>
            </div>
            <CardHeader className="pb-3 pt-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Starter</CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold">$7</span>
                  <span className="text-muted-foreground">/mo</span>
                  {selectedPlan === "subscription" && (
                    <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                      <Check className="h-3 w-3 text-primary-foreground" />
                    </div>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pb-4">
              <p className="text-sm text-muted-foreground mb-3">
                For regular form-fillers. Save time on every form.
              </p>
              <ul className="space-y-1.5 text-sm">
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-primary" />
                  2 forms included per month
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-primary" />
                  Save profile for autofill
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-primary" />
                  Saved signature
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-primary" />
                  180-day form history
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Email input for one-time */}
          {selectedPlan === "one_time" && !isAuthenticated && (
            <div className="space-y-2">
              <Label htmlFor="email">Email (for receipt)</Label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="input-email"
              />
              <p className="text-xs text-muted-foreground">
                We'll send the download link to this email
              </p>
            </div>
          )}

          <Separator />

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Shield className="h-4 w-4" />
            <span>Secure payment via Stripe</span>
          </div>

          <Button 
            className="w-full" 
            onClick={handleCheckout}
            disabled={checkoutMutation.isPending}
            data-testid="button-checkout"
          >
            {checkoutMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <CreditCard className="mr-2 h-4 w-4" />
                {selectedPlan === "one_time" ? "Pay $5" : "Subscribe to Starter — $7/mo"}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
