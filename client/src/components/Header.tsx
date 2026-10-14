import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./ThemeToggle";
import { useAuth } from "@/hooks/useAuth";
import { FileText, User, LogOut, Menu, X, Library } from "lucide-react";
import { getPlanDisplayName } from "@shared/pricing";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

const navLinks = [
  { href: "/#pricing", label: "Pricing" },
  { href: "/blog", label: "Blog" },
  { href: "/contact", label: "Contact" },
];

export function Header() {
  const { user, isAuthenticated, isPro, tier } = useAuth();
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const getInitials = () => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    if (user?.email) {
      return user.email[0].toUpperCase();
    }
    return "U";
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 gap-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary text-primary-foreground">
              <FileText className="h-5 w-5" />
            </div>
            <span className="font-semibold text-lg tracking-tight">AutoFillPDF</span>
          </Link>
          
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href}>
                <Button 
                  variant="ghost" 
                  size="sm"
                  className={location === link.href || (link.href === "/blog" && location.startsWith("/blog")) 
                    ? "text-primary" 
                    : "text-muted-foreground hover:text-foreground"
                  }
                  data-testid={`nav-${link.label.toLowerCase()}`}
                >
                  {link.label}
                </Button>
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />

          {isAuthenticated ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-9 w-9 rounded-full" data-testid="button-user-menu">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={user?.profileImageUrl || undefined} alt={user?.firstName || "User"} className="object-cover" />
                    <AvatarFallback className="bg-primary/10 text-primary font-medium">
                      {getInitials()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="flex items-center justify-start gap-2 p-2">
                  <div className="flex flex-col space-y-1 leading-none">
                    {user?.firstName && (
                      <p className="font-medium">{user.firstName} {user.lastName}</p>
                    )}
                    {user?.email && (
                      <p className="w-[200px] truncate text-sm text-muted-foreground">
                        {user.email}
                      </p>
                    )}
                    {isPro && tier && (
                      <Badge variant="default" className="w-fit mt-1">{getPlanDisplayName(tier as any)}</Badge>
                    )}
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/dashboard" className="flex items-center cursor-pointer" data-testid="link-dashboard">
                    <User className="mr-2 h-4 w-4" />
                    Dashboard
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/templates" className="flex items-center cursor-pointer" data-testid="link-templates">
                    <Library className="mr-2 h-4 w-4" />
                    Templates
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <a href="/api/logout" className="flex items-center cursor-pointer text-destructive" data-testid="button-logout">
                    <LogOut className="mr-2 h-4 w-4" />
                    Log out
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button asChild data-testid="button-login" className="hidden sm:flex">
              <a href="/api/login">Log in</a>
            </Button>
          )}
          
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" data-testid="button-mobile-menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <nav className="flex flex-col gap-2 mt-8">
                {navLinks.map((link) => (
                  <Link key={link.href} href={link.href} onClick={() => setMobileMenuOpen(false)}>
                    <Button 
                      variant="ghost" 
                      className={`w-full justify-start ${
                        location === link.href || (link.href === "/blog" && location.startsWith("/blog")) 
                          ? "text-primary bg-primary/5" 
                          : ""
                      }`}
                    >
                      {link.label}
                    </Button>
                  </Link>
                ))}
                <div className="border-t my-2" />
                <Link href="/upload" onClick={() => setMobileMenuOpen(false)}>
                  <Button className="w-full">Upload PDF</Button>
                </Link>
                {!isAuthenticated && (
                  <Button variant="outline" asChild className="w-full">
                    <a href="/api/login">Log in</a>
                  </Button>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}