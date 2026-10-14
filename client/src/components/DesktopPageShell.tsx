import type { ReactNode } from "react";
import { Header } from "@/components/Header";
import { cn } from "@/lib/utils";

interface DesktopPageShellProps {
  children: ReactNode;
  contentClassName?: string;
  mainClassName?: string;
}

export function DesktopPageShell({
  children,
  contentClassName,
  mainClassName,
}: DesktopPageShellProps) {
  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-background">
      <Header />
      <main className={cn("min-h-0 flex-1 overflow-auto", mainClassName)}>
        <div className={cn("mx-auto w-full max-w-7xl px-6 py-6 lg:px-8", contentClassName)}>
          {children}
        </div>
      </main>
    </div>
  );
}
