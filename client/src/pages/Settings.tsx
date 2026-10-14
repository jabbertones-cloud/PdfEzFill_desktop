import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  Shield,
  LifeBuoy,
  ExternalLink,
  FolderCog,
  HardDrive,
  KeyRound,
  RefreshCw,
  Globe,
  FileText,
  Mail,
  Sparkles,
} from "lucide-react";
import { DesktopPageShell } from "@/components/DesktopPageShell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useLicense } from "@/hooks/useLicense";
import { openExternalUrl } from "@/lib/desktop";

const PRODUCT_LINKS = [
  { label: "Website", url: "https://pdfezfill.com", icon: Globe },
  { label: "How It Works", url: "https://pdfezfill.com/#how-it-works", icon: ExternalLink },
  { label: "Pricing", url: "https://pdfezfill.com/#pricing", icon: ExternalLink },
  { label: "Features", url: "https://pdfezfill.com/#features", icon: ExternalLink },
];

const COMPANY_LINKS = [
  { label: "Contact", url: "mailto:admin@autofillpdf.com", icon: Mail },
  { label: "Privacy Policy", url: "https://pdfezfill.com/privacy", icon: ExternalLink },
  { label: "Terms of Service", url: "https://pdfezfill.com/terms", icon: ExternalLink },
  { label: "Refund Policy", url: "https://pdfezfill.com/refund", icon: ExternalLink },
];

export default function Settings() {
  const { toast } = useToast();
  const { license, isActive, isExpired, inTrial, trialRemaining, trialLimit } = useLicense();
  const [appVersion, setAppVersion] = useState<string>("");
  const [dataPaths, setDataPaths] = useState<{ userData: string; db: string; storage: string } | null>(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);

  useEffect(() => {
    let alive = true;

    window.electronAPI?.getVersion?.().then((version) => {
      if (alive) setAppVersion(version);
    });

    window.electronAPI?.getDataPaths?.().then((paths) => {
      if (alive) setDataPaths(paths);
    });

    return () => {
      alive = false;
    };
  }, []);

  const handleCheckForUpdates = async () => {
    if (!window.electronAPI?.checkForUpdates) {
      toast({
        title: "Updates unavailable",
        description: "Automatic updates are only available in the desktop app.",
      });
      return;
    }

    setCheckingUpdates(true);
    try {
      await window.electronAPI.checkForUpdates();
      toast({
        title: "Checking for updates",
        description: "PdfEzFill will let you know if a new version is ready.",
      });
    } finally {
      setCheckingUpdates(false);
    }
  };

  const licenseLabel = isActive
    ? license?.plan === "lifetime"
      ? "Lifetime active"
      : "License active"
    : isExpired
      ? "Expired"
      : inTrial
        ? "Free trial"
        : "Needs activation";

  return (
    <DesktopPageShell contentClassName="max-w-6xl">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <Badge variant="secondary" className="w-fit gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              Desktop Settings
            </Badge>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Everything that used to feel like website footer content now lives here in a desktop-friendly place:
                app details, support, policies, and license controls.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/activate">
                <KeyRound className="mr-2 h-4 w-4" />
                Open License Screen
              </Link>
            </Button>
            <Button variant="outline" onClick={() => void openExternalUrl("https://pdfezfill.com")}>
              <Globe className="mr-2 h-4 w-4" />
              Open Website
            </Button>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
          <div className="space-y-6 min-w-0">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <KeyRound className="h-5 w-5" />
                  License & Billing
                </CardTitle>
                <CardDescription>
                  Manage activation, trial status, and purchase links without leaving the app shell.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant={isActive ? "default" : isExpired ? "destructive" : "secondary"}>
                    {licenseLabel}
                  </Badge>
                  {license?.email && (
                    <span className="text-sm text-muted-foreground">{license.email}</span>
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border bg-muted/30 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current access</p>
                    <p className="mt-2 text-lg font-semibold">
                      {isActive
                        ? license?.plan === "lifetime"
                          ? "Lifetime plan"
                          : "Yearly plan"
                        : inTrial
                          ? `${trialRemaining} of ${trialLimit} trial forms left`
                          : "Activation needed"}
                    </p>
                    {license?.expiresAt && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Renews or expires on {new Date(license.expiresAt).toLocaleDateString()}.
                      </p>
                    )}
                  </div>
                  <div className="rounded-xl border bg-muted/30 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Need another key?</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Purchase links open in your browser, while the activation flow stays inside this desktop window.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => void openExternalUrl("https://pdfezfill.com/purchase?plan=yearly")}>
                        Buy Yearly
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void openExternalUrl("https://pdfezfill.com/purchase?plan=lifetime")}>
                        Buy Lifetime
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FolderCog className="h-5 w-5" />
                  App & Appearance
                </CardTitle>
                <CardDescription>
                  Desktop-specific details for this Mac app, including version and local storage paths.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 p-4">
                  <div>
                    <p className="font-medium">Theme</p>
                    <p className="text-sm text-muted-foreground">
                      Switch between light and dark without leaving the current window.
                    </p>
                  </div>
                  <ThemeToggle />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Version</p>
                    <p className="mt-2 text-lg font-semibold">{appVersion || "Loading..."}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => void handleCheckForUpdates()}
                      disabled={checkingUpdates}
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      {checkingUpdates ? "Checking..." : "Check for Updates"}
                    </Button>
                  </div>
                  <div className="rounded-xl border p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Storage</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Your local database and saved files stay in your app data folder on this Mac.
                    </p>
                    <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                      {dataPaths ? (
                        <>
                          <p className="break-all"><span className="font-medium text-foreground">User data:</span> {dataPaths.userData}</p>
                          <p className="break-all"><span className="font-medium text-foreground">Database:</span> {dataPaths.db}</p>
                          <p className="break-all"><span className="font-medium text-foreground">Files:</span> {dataPaths.storage}</p>
                        </>
                      ) : (
                        <p>Loading storage paths...</p>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6 min-w-0">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Product & Company
                </CardTitle>
                <CardDescription>
                  The footer-style links are collected here so they fit naturally inside the desktop app.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  {PRODUCT_LINKS.map(({ label, url, icon: Icon }) => (
                    <Button
                      key={label}
                      variant="ghost"
                      className="h-auto w-full justify-between px-3 py-3"
                      onClick={() => void openExternalUrl(url)}
                    >
                      <span className="flex items-center gap-2 text-sm">
                        <Icon className="h-4 w-4" />
                        {label}
                      </span>
                      <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  ))}
                </div>

                <Separator />

                <div className="space-y-3">
                  {COMPANY_LINKS.map(({ label, url, icon: Icon }) => (
                    <Button
                      key={label}
                      variant="ghost"
                      className="h-auto w-full justify-between px-3 py-3"
                      onClick={() => void openExternalUrl(url)}
                    >
                      <span className="flex items-center gap-2 text-sm">
                        <Icon className="h-4 w-4" />
                        {label}
                      </span>
                      <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Trust & Support
                </CardTitle>
                <CardDescription>
                  Key support and security information, adapted for the desktop app instead of a website footer.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl border bg-muted/30 p-4">
                  <div className="flex items-start gap-3">
                    <Shield className="mt-0.5 h-4 w-4 text-primary" />
                    <div>
                      <p className="font-medium">Secure transport</p>
                      <p className="text-sm text-muted-foreground">
                        Purchase and account pages use secure browser links, while your desktop app stores its files locally on this Mac.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border bg-muted/30 p-4">
                  <div className="flex items-start gap-3">
                    <HardDrive className="mt-0.5 h-4 w-4 text-primary" />
                    <div>
                      <p className="font-medium">Desktop-aware storage</p>
                      <p className="text-sm text-muted-foreground">
                        Forms and app data stay within the desktop environment instead of being treated like temporary website content.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border bg-muted/30 p-4">
                  <div className="flex items-start gap-3">
                    <LifeBuoy className="mt-0.5 h-4 w-4 text-primary" />
                    <div>
                      <p className="font-medium">Support</p>
                      <p className="text-sm text-muted-foreground">
                        Email <button className="font-medium text-foreground underline underline-offset-2" onClick={() => void openExternalUrl("mailto:admin@autofillpdf.com")}>admin@autofillpdf.com</button> if you need help with activation, billing, or the app itself.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DesktopPageShell>
  );
}
