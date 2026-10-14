import { Link } from "wouter";
import { FileText, Shield, Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Footer() {
  return (
    <footer className="border-t bg-muted/30">
      <div className="container mx-auto px-4 py-8 sm:py-12">
        <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-4">
          <div className="space-y-4">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-foreground">
                <FileText className="h-4 w-4" />
              </div>
              <span className="font-semibold">AutoFillPDF</span>
            </Link>
            <p className="text-sm text-muted-foreground">
              Turn any PDF form into a clean online form. Fill it once, download it complete.
            </p>
          </div>

          <div className="space-y-4">
            <h4 className="font-medium">Product</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/#how-it-works" className="hover:text-foreground transition-colors">
                  How it works
                </Link>
              </li>
              <li>
                <Link href="/#pricing" className="hover:text-foreground transition-colors">
                  Pricing
                </Link>
              </li>
              <li>
                <Link href="/#features" className="hover:text-foreground transition-colors">
                  Features
                </Link>
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <h4 className="font-medium">Company</h4>
            <ul className="space-y-2">
              <li>
                <Link href="/blog">
                  <Button variant="ghost" className="p-0 h-auto text-muted-foreground hover:text-foreground">
                    Blog
                  </Button>
                </Link>
              </li>
              <li>
                <Link href="/contact">
                  <Button variant="ghost" className="p-0 h-auto text-muted-foreground hover:text-foreground">
                    Contact
                  </Button>
                </Link>
              </li>
              <li>
                <Link href="/privacy">
                  <Button variant="ghost" className="p-0 h-auto text-muted-foreground hover:text-foreground">
                    Privacy Policy
                  </Button>
                </Link>
              </li>
              <li>
                <Link href="/terms">
                  <Button variant="ghost" className="p-0 h-auto text-muted-foreground hover:text-foreground">
                    Terms of Service
                  </Button>
                </Link>
              </li>
              <li>
                <Link href="/refund">
                  <Button variant="ghost" className="p-0 h-auto text-muted-foreground hover:text-foreground">
                    Refund Policy
                  </Button>
                </Link>
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <h4 className="font-medium">Trust & Security</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary flex-shrink-0" />
                <span>256-bit encryption</span>
              </li>
              <li className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-primary flex-shrink-0" />
                <span>Auto-delete after use</span>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-primary flex-shrink-0" />
                <span>admin@autofilllpdf.com</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 sm:mt-12 pt-6 sm:pt-8 border-t text-center text-xs sm:text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} AutoFillPDF. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
