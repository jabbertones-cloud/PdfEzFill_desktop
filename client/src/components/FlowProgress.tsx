/**
 * FlowProgress — shows the user exactly where they are in the 3-step flow.
 * Step 1: Pick PDF  →  Step 2: Fill It In  →  Step 3: Save Your PDF
 *
 * Writing style: 3rd–5th grade, autism/ADHD-friendly, one idea at a time.
 */
import { Upload, PenTool, Download, Check } from "lucide-react";

export type FlowStep = "upload" | "fill" | "download";

const STEPS: { id: FlowStep; label: string; icon: typeof Upload }[] = [
  { id: "upload",   label: "Step 1 — Pick PDF",     icon: Upload   },
  { id: "fill",     label: "Step 2 — Fill It In",   icon: PenTool  },
  { id: "download", label: "Step 3 — Save Your PDF", icon: Download },
];

interface FlowProgressProps {
  current: FlowStep;
}

export function FlowProgress({ current }: FlowProgressProps) {
  const currentIdx = STEPS.findIndex((s) => s.id === current);

  return (
    <div
      className="flex items-center justify-center gap-0 mb-6"
      role="progressbar"
      aria-label={`You are on ${STEPS[currentIdx]?.label}`}
    >
      {STEPS.map((step, idx) => {
        const done    = idx < currentIdx;
        const active  = idx === currentIdx;
        const pending = idx > currentIdx;

        const Icon = step.icon;

        return (
          <div key={step.id} className="flex items-center">
            {/* Step bubble */}
            <div className="flex flex-col items-center gap-1">
              <div
                className={[
                  "w-9 h-9 rounded-full flex items-center justify-center transition-colors",
                  done    ? "bg-primary text-primary-foreground"          : "",
                  active  ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2" : "",
                  pending ? "bg-muted text-muted-foreground"              : "",
                ].join(" ")}
                aria-current={active ? "step" : undefined}
              >
                {done ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </div>
              <span
                className={[
                  "text-[11px] font-medium text-center leading-tight max-w-[72px]",
                  active  ? "text-primary" : "",
                  pending ? "text-muted-foreground" : "",
                  done    ? "text-primary/70" : "",
                ].join(" ")}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line between steps */}
            {idx < STEPS.length - 1 && (
              <div
                className={[
                  "h-0.5 w-10 sm:w-16 mx-1 mb-5 transition-colors",
                  idx < currentIdx ? "bg-primary" : "bg-muted",
                ].join(" ")}
                aria-hidden="true"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
