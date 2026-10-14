/**
 * Activate page — user enters their license key + email after purchasing.
 *
 * Writing style: 3rd–5th grade, autism/ADHD-friendly, calm and clear.
 * One job: type in your key, press the button, done.
 */
import { useState } from "react";
import { useLocation, Link } from "wouter";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useLicense } from "@/hooks/useLicense";
import { apiRequest } from "@/lib/queryClient";
import { Key, CheckCircle2, Loader2, ShoppingCart, ArrowLeft } from "lucide-react";

export default function Activate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { refetch, isActive, license } = useLicense();

  const [licenseKey, setLicenseKey] = useState("");
  const [email, setEmail]           = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activated, setActivated]   = useState(false);

  // ─── Format key as user types: PDFEZ-XXXX-XXXX-XXXX-XXXX ─────────────────
  const handleKeyChange = (raw: string) => {
    // Strip everything except alphanumeric, force upper
    const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");

    // Add dashes automatically in the right places
    let formatted = "";
    if (cleaned.length <= 5)       formatted = cleaned;
    else if (cleaned.length <= 9)  formatted = `${cleaned.slice(0,5)}-${cleaned.slice(5)}`;
    else if (cleaned.length <= 13) formatted = `${cleaned.slice(0,5)}-${cleaned.slice(5,9)}-${cleaned.slice(9)}`;
    else if (cleaned.length <= 17) formatted = `${cleaned.slice(0,5)}-${cleaned.slice(5,9)}-${cleaned.slice(9,13)}-${cleaned.slice(13)}`;
    else                           formatted = `${cleaned.slice(0,5)}-${cleaned.slice(5,9)}-${cleaned.slice(9,13)}-${cleaned.slice(13,17)}-${cleaned.slice(17,21)}`;

    setLicenseKey(formatted);
  };

  const handleActivate = async () => {
    const trimmedKey   = licenseKey.trim();
    const trimmedEmail = email.trim();

    if (!trimmedKey) {
      toast({ title: "Type Your License Key", description: "It looks like PDFEZ-XXXX-XXXX-XXXX-XXXX.", variant: "destructive" });
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      toast({ title: "Add Your Email", description: "Use the email you bought with.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiRequest("POST", "/api/license/activate", {
        licenseKey: trimmedKey,
        email: trimmedEmail,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).message || "That key did not work. Check it and try again.");
      }

      await refetch();
      setActivated(true);

      toast({ title: "License Active!", description: "You are all set. Let's fill some forms." });
    } catch (err: any) {
      toast({
        title: "Key Did Not Work",
        description: err.message || "Check your key and email, then try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Already activated → show success state ──────────────────────────────
  if (activated || isActive) {
    const plan = license?.plan || "active";
    const expires = license?.expiresAt ? new Date(license.expiresAt).toLocaleDateString() : null;

    return (
      <div className="min-h-screen flex flex-col bg-muted/20">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-16">
          <div className="max-w-md mx-auto text-center space-y-6">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-10 w-10 text-primary" />
            </div>
            <h1 className="text-3xl font-bold">You Are All Set!</h1>
            <p className="text-muted-foreground">
              Your license is active.
              {expires && ` It is good until ${expires}.`}
            </p>
            <Card>
              <CardContent className="p-4 text-left space-y-1 text-sm text-muted-foreground">
                <p><span className="font-medium text-foreground">Plan:</span> {plan === "lifetime" ? "Lifetime" : plan === "yearly" ? "Yearly" : plan}</p>
                {license?.email && (
                  <p><span className="font-medium text-foreground">Email:</span> {license.email}</p>
                )}
                {license?.daysUntilExpiry != null && (
                  <p><span className="font-medium text-foreground">Days left:</span> {license.daysUntilExpiry}</p>
                )}
              </CardContent>
            </Card>
            <Button onClick={() => setLocation("/upload")} className="w-full h-12">
              Start Filling a Form →
            </Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // ─── Main activation form ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col bg-muted/20">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="max-w-md mx-auto space-y-6">

          {/* Back link */}
          <Button variant="ghost" size="sm" asChild className="-ml-2">
            <Link href="/">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back
            </Link>
          </Button>

          {/* Icon + title */}
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Key className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold">Enter Your License Key</h1>
            <p className="text-muted-foreground text-sm">
              Check your email after buying. Copy the key and paste it here.
            </p>
          </div>

          {/* Form card */}
          <Card>
            <CardContent className="p-6 space-y-5">

              {/* License key input */}
              <div className="space-y-1.5">
                <Label htmlFor="license-key" className="font-medium">
                  License Key
                </Label>
                <Input
                  id="license-key"
                  placeholder="PDFEZ-XXXX-XXXX-XXXX-XXXX"
                  value={licenseKey}
                  onChange={(e) => handleKeyChange(e.target.value)}
                  className="font-mono text-center tracking-widest"
                  maxLength={24}
                  data-testid="input-license-key"
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  It starts with PDFEZ- and has four groups of letters and numbers.
                </p>
              </div>

              {/* Email input */}
              <div className="space-y-1.5">
                <Label htmlFor="license-email" className="font-medium">
                  Email You Bought With
                </Label>
                <Input
                  id="license-email"
                  type="email"
                  placeholder="you@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  data-testid="input-license-email"
                  autoComplete="email"
                />
                <p className="text-xs text-muted-foreground">
                  This is the email you used when you paid.
                </p>
              </div>

              {/* Submit */}
              <Button
                className="w-full h-11"
                onClick={handleActivate}
                disabled={isSubmitting}
                data-testid="button-activate"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Checking Your Key…
                  </>
                ) : (
                  <>
                    <Key className="mr-2 h-4 w-4" />
                    Activate My License
                  </>
                )}
              </Button>

            </CardContent>
          </Card>

          {/* No key yet? */}
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-center">No Key Yet?</CardTitle>
              <CardDescription className="text-center text-sm">
                Pick a plan and we will email you a key right away.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pb-5">
              <Button
                className="w-full"
                onClick={() => window.open("https://pdfezfill.com/purchase?plan=yearly", "_blank")}
              >
                <ShoppingCart className="mr-2 h-4 w-4" />
                Yearly — $47/yr (Best Deal)
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => window.open("https://pdfezfill.com/purchase?plan=lifetime", "_blank")}
              >
                Lifetime — $97 (Pay Once)
              </Button>
            </CardContent>
          </Card>

        </div>
      </main>

      <Footer />
    </div>
  );
}
