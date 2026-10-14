/**
 * WelcomeBanner — shown once when the user first loads a page.
 * Dismisses and remembers the choice in localStorage.
 * Writing style: 3rd–5th grade, autism/ADHD-friendly, warm and direct.
 */
import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WelcomeBannerProps {
  /** Unique key for this banner — stored in localStorage to track dismissal */
  storageKey: string;
  /** Emoji icon (optional) shown before the heading */
  emoji?: string;
  /** Bold heading line */
  heading: string;
  /** One or two plain sentences below the heading */
  body: string;
}

export function WelcomeBanner({ storageKey, emoji, heading, body }: WelcomeBannerProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(`welcome-${storageKey}`);
    if (!dismissed) {
      setVisible(true);
    }
  }, [storageKey]);

  const dismiss = () => {
    localStorage.setItem(`welcome-${storageKey}`, "1");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="status"
      className="relative flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 mb-4"
    >
      {emoji && (
        <span className="text-2xl leading-none mt-0.5" aria-hidden="true">
          {emoji}
        </span>
      )}
      <div className="flex-1 space-y-0.5">
        <p className="font-semibold text-sm leading-snug">{heading}</p>
        <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
        onClick={dismiss}
        aria-label="Close this message"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
