/**
 * LicenseGate — wraps the whole app.
 *
 * States:
 *   • active license  → show children normally
 *   • in trial        → show children + trial banner at top
 *   • trial exhausted → show paywall (no children visible)
 *   • loading         → show nothing (avoids flash)
 *
 * Writing style: 3rd–5th grade, autism/ADHD-friendly, warm and direct.
 */
import { ReactNode } from "react";
import { Link } from "wouter";
import { useLicense } from "@/hooks/useLicense";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Sparkles, Key, ShoppingCart } from "lucide-react";

interface LicenseGateProps {
  children: ReactNode;
}

export function LicenseGate({ children }: LicenseGateProps) {
  const { isLoading, isActive, isExpired, inTrial, isGated, trialRemaining, trialLimit } = useLicense();

  // Don't flash paywall on load
  if (isLoading) return <>{children}</>;

  // ── Trial exhausted or expired → full paywall ─────────────────────────────
  if (isGated || isExpired) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-muted/20 px-4 py-16">
        <div className="w-full max-w-md space-y-8 text-center">

          {/* Icon */}
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Sparkles className="h-10 w-10 text-primary" />
          </div>

          {/* Heading */}
          <div className="space-y-2">
            {isExpired ? (
              <>
                <h1 className="text-3xl font-bold">Your License Ran Out</h1>
                <p className="text-muted-foreground">
                  It is time to renew so you can keep filling forms!
                </p>
              </>
            ) : (
              <>
                <h1 className="text-3xl font-bold">You Used Your {trialLimit} Free Forms!</h1>
                <p className="text-muted-foreground">
                  You tried it out — nice work! Get a license to keep going.
                </p>
              </>
            )}
          </div>

          {/* Price cards */}
          <div className="grid gap-4">
            {/* Yearly */}
            <div className="rounded-xl border-2 border-primary bg-primary/5 p-5 text-left space-y-2 relative">
              <Badge className="absolute top-3 right-3 bg-primary text-primary-foreground">
                Best Deal
              </Badge>
              <p className="font-bold text-lg">Yearly Plan</p>
              <p className="text-3xl font-bold">$47 <span className="text-base font-normal text-muted-foreground">/ year</span></p>
              <p className="text-sm text-muted-foreground">
                Fill as many forms as you want. License works on 1 computer.
                Renews each year — cancel any time.
              </p>
              <Button
                className="w-full mt-2"
                onClick={() => window.open("https://pdfezfill.com/purchase?plan=yearly", "_blank")}
              >
                <ShoppingCart className="mr-2 h-4 w-4" />
                Get Yearly — $47/yr
              </Button>
            </div>

            {/* Lifetime */}
            <div className="rounded-xl border p-5 text-left space-y-2">
              <p className="font-bold text-lg">Lifetime License</p>
              <p className="text-3xl font-bold">$97 <span className="text-base font-normal text-muted-foreground">one time</span></p>
              <p className="text-sm text-muted-foreground">
                Pay once, use forever. No renewals. Works on 1 computer.
              </p>
              <Button
                variant="outline"
                className="w-full mt-2"
                onClick={() => window.open("https://pdfezfill.com/purchase?plan=lifetime", "_blank")}
              >
                Get Lifetime — $97
              </Button>
            </div>
          </div>

          {/* Already bought? Enter key */}
          <div className="pt-2">
            <p className="text-sm text-muted-foreground mb-2">
              Already bought? Check your email for your license key.
            </p>
            <Button variant="ghost" asChild>
              <Link href="/activate">
                <Key className="mr-2 h-4 w-4" />
                Enter My License Key
              </Link>
            </Button>
          </div>

        </div>
      </div>
    );
  }

  // ── Active or in-trial → show the app ─────────────────────────────────────
  return (
    <>
      {/* Trial banner */}
      {inTrial && trialRemaining <= trialLimit && (
        <TrialBanner remaining={trialRemaining} limit={trialLimit} />
      )}
      {children}
    </>
  );
}

// ─── Small top banner shown during trial ──────────────────────────────────────
function TrialBanner({ remaining, limit }: { remaining: number; limit: number }) {
  const isLastOne = remaining === 1;

  return (
    <div className="w-full bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between gap-4 text-sm">
      <div className="flex items-center gap-2 text-amber-800">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>
          {isLastOne
            ? "This is your last free form! Get a license to keep going."
            : `Free trial: ${remaining} of ${limit} forms left.`}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          variant="outline"
          className="h-7 border-amber-400 text-amber-800 hover:bg-amber-100"
          onClick={() => window.open("https://pdfezfill.com/purchase?plan=yearly", "_blank")}
        >
          Get Full Access
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-amber-700"
          asChild
        >
          <Link href="/activate">Enter Key</Link>
        </Button>
      </div>
    </div>
  );
}
