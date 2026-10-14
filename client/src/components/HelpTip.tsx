/**
 * HelpTip — a small (?) button that opens a plain-English popover.
 * Writing style: 3rd–5th grade, autism/ADHD-friendly, calm and clear.
 *
 * Usage:
 *   <HelpTip title="What does this do?" body="Click here to fix a label that is wrong." />
 */
import { HelpCircle } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface HelpTipProps {
  /** Short bold heading shown at the top of the popover */
  title: string;
  /** One or two sentences explaining the thing in plain English */
  body: string;
  /** Optional extra tip shown below the main body */
  tip?: string;
}

export function HelpTip({ title, body, tip }: HelpTipProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Help: ${title}`}
          className="inline-flex items-center justify-center w-5 h-5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 text-sm space-y-1.5"
        side="top"
        align="center"
      >
        <p className="font-semibold leading-snug">{title}</p>
        <p className="text-muted-foreground leading-relaxed">{body}</p>
        {tip && (
          <p className="text-xs text-muted-foreground border-t pt-1.5 mt-1 leading-relaxed">
            💡 {tip}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
