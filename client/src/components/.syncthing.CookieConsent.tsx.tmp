import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Cookie } from "lucide-react";
import { Link } from "wouter";

export function CookieConsent() {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem("cookie-consent");
    if (!consent) {
      if (typeof window !== "undefined" && (window as any).gtag) {
        (window as any).gtag("consent", "default", {
          analytics_storage: "denied"
        });
      }
      const timer = setTimeout(() => setShowBanner(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const acceptAll = () => {
    localStorage.setItem("cookie-consent", JSON.stringify({
      essential: true,
      analytics: true,
      accepted: true,
      timestamp: new Date().toISOString()
    }));
    if (typeof window !== "undefined" && (window as any).gtag) {
      (window as any).gtag("consent", "update", {
        analytics_storage: "granted"
      });
    }
    setShowBanner(false);
  };

  const acceptEssential = () => {
    localStorage.setItem("cookie-consent", JSON.stringify({
      essential: true,
      analytics: false,
      accepted: true,
      timestamp: new Date().toISOString()
    }));
    if (typeof window !== "undefined" && (window as any).gtag) {
      (window as any).gtag("consent", "update", {
        analytics_storage: "denied"
      });
    }
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 md:p-6" data-testid="cookie-consent-banner">
      <Card className="max-w-4xl mx-auto p-4 md:p-6 shadow-lg border-2">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
          <div className="flex items-start gap-3 flex-1">
            <div className="p-2 rounded-lg bg-primary/10 flex-shrink-0">
              <Cookie className="h-5 w-5 text-primary" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">We value your privacy</p>
              <p className="text-sm text-muted-foreground">
                We use essential cookies to make our site work. With your consent, we also use analytics cookies to understand how you use our service and improve it.{" "}
                <Link href="/privacy" className="underline hover:text-primary">
                  Learn more
                </Link>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 w-full md:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={acceptEssential}
              className="flex-1 md:flex-none"
              data-testid="button-cookie-essential"
            >
              Essential Only
            </Button>
            <Button
              size="sm"
              onClick={acceptAll}
              className="flex-1 md:flex-none"
              data-testid="button-cookie-accept"
            >
              Accept All
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
