import { Switch, Route, useLocation } from "wouter";
import { useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { CookieConsent } from "@/components/CookieConsent";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LicenseGate } from "@/components/LicenseGate";
import { initGA, trackPageView } from "@/lib/analytics";
import Landing from "@/pages/Landing";
import Upload from "@/pages/Upload";
import FormFill from "@/pages/FormFill";
import Download from "@/pages/Download";
import Activate from "@/pages/Activate";
import Dashboard from "@/pages/Dashboard";
import BatchFill from "@/pages/BatchFill";
import Templates from "@/pages/Templates";
import Admin from "@/pages/Admin";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import TermsOfService from "@/pages/TermsOfService";
import RefundPolicy from "@/pages/RefundPolicy";
import Contact from "@/pages/Contact";
import Blog from "@/pages/Blog";
import BlogPost from "@/pages/BlogPost";
import NotFound from "@/pages/not-found";

function usePageTracking() {
  const [location] = useLocation();

  useEffect(() => {
    initGA();
  }, []);

  useEffect(() => {
    trackPageView(location);
  }, [location]);
}

function Router() {
  usePageTracking();

  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/activate" component={Activate} />
      <Route path="/upload" component={Upload} />
      <Route path="/fill/:formId" component={FormFill} />
      <Route path="/form/:formId" component={FormFill} />
      <Route path="/download/:formId" component={Download} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/batch-fill" component={BatchFill} />
      <Route path="/templates" component={Templates} />
      <Route path="/contact" component={Contact} />
      <Route path="/support" component={Contact} />
      <Route path="/blog" component={Blog} />
      <Route path="/blog/:slug" component={BlogPost} />
      <Route path="/privacy" component={PrivacyPolicy} />
      <Route path="/terms" component={TermsOfService} />
      <Route path="/refund" component={RefundPolicy} />
      <Route path="/admin" component={Admin} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <ErrorBoundary>
            <Toaster />
            {/* LicenseGate wraps all routes.
                Shows trial banner (in-trial) or full paywall (trial exhausted / expired).
                /activate is always reachable inside the gate so users can enter their key. */}
            <LicenseGate>
              <Router />
            </LicenseGate>
            <CookieConsent />
          </ErrorBoundary>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
