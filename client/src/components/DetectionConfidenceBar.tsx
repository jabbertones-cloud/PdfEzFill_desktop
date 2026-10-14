import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface DetectionConfidenceBarProps {
  confidence: number;
  showLabel?: boolean;
  size?: "sm" | "md";
}

export function DetectionConfidenceBar({
  confidence,
  showLabel = true,
  size = "md",
}: DetectionConfidenceBarProps) {
  const getColorClass = () => {
    if (confidence >= 80) return "text-green-600";
    if (confidence >= 50) return "text-yellow-600";
    return "text-red-600";
  };

  const getBarClass = () => {
    if (confidence >= 80) return "bg-green-500";
    if (confidence >= 50) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <div
              className="overflow-hidden rounded-full bg-muted"
              style={{ height: size === "sm" ? "4px" : "6px" }}
            >
              <div
                className={`h-full transition-all duration-300 ${getBarClass()}`}
                style={{ width: `${confidence}%` }}
              />
            </div>
          </div>
          {showLabel && (
            <span className={`text-xs font-medium whitespace-nowrap ${getColorClass()}`}>
              {Math.round(confidence)}%
            </span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-sm">
          <p className="font-medium">Confidence: {Math.round(confidence)}%</p>
          <p className="text-xs text-muted-foreground mt-1">
            {confidence >= 80
              ? "High confidence detection"
              : confidence >= 50
              ? "Medium confidence - review recommended"
              : "Low confidence - manual review required"}
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
