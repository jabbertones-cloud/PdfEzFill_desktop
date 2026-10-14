import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertTriangle, AlertCircle, XCircle, X, RefreshCw, Info } from "lucide-react";

export type QualityLevel = "high" | "medium" | "low" | "unusable";

interface QualityBannerProps {
  confidence: number;
  fieldsDetected: number;
  qualityLevel?: QualityLevel | null;
  qualityMessage?: string | null;
  onDismiss?: () => void;
  onReupload?: () => void;
}

export function QualityBanner({ 
  confidence, 
  fieldsDetected, 
  qualityLevel,
  qualityMessage,
  onDismiss,
  onReupload,
}: QualityBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  const effectiveLevel: QualityLevel = qualityLevel ?? (
    confidence >= 85 ? "high" :
    confidence >= 70 ? "medium" :
    confidence >= 50 ? "low" : "unusable"
  );


  if (effectiveLevel === "high") {
    return (
      <Alert 
        className="relative" 
        style={{ 
          backgroundColor: 'hsl(var(--success) / 0.1)', 
          borderColor: 'hsl(var(--success) / 0.3)' 
        }} 
        data-testid="quality-banner-high"
      >
        <CheckCircle2 className="h-5 w-5" style={{ color: 'hsl(var(--success))' }} />
        <AlertTitle style={{ color: 'hsl(var(--success))' }}>
          All Set! We Found Your Fields.
        </AlertTitle>
        <AlertDescription style={{ color: 'hsl(var(--success) / 0.9)' }}>
          {qualityMessage || `We found ${fieldsDetected} spots to fill in. Scroll down and start typing!`}
        </AlertDescription>
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 h-8 w-8"
          style={{ color: 'hsl(var(--success))' }}
          onClick={handleDismiss}
          data-testid="button-dismiss-quality-banner"
        >
          <X className="h-4 w-4" />
        </Button>
      </Alert>
    );
  }

  if (effectiveLevel === "medium") {
    return (
      <Alert 
        className="relative" 
        style={{ 
          backgroundColor: 'hsl(var(--warning) / 0.1)', 
          borderColor: 'hsl(var(--warning) / 0.3)' 
        }} 
        data-testid="quality-banner-medium"
      >
        <AlertTriangle className="h-5 w-5" style={{ color: 'hsl(var(--warning))' }} />
        <AlertTitle style={{ color: 'hsl(var(--warning))' }}>
          Almost There — Check a Few Spots
        </AlertTitle>
        <AlertDescription style={{ color: 'hsl(var(--warning) / 0.9)' }}>
          {qualityMessage || `We found ${fieldsDetected} spots. A few might need fixing. Look them over before you finish.`}
        </AlertDescription>
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 h-8 w-8"
          style={{ color: 'hsl(var(--warning))' }}
          onClick={handleDismiss}
          data-testid="button-dismiss-quality-banner"
        >
          <X className="h-4 w-4" />
        </Button>
      </Alert>
    );
  }

  if (effectiveLevel === "low") {
    return (
      <Alert 
        className="relative" 
        style={{ 
          backgroundColor: 'hsl(24 95% 53% / 0.1)', 
          borderColor: 'hsl(24 95% 53% / 0.3)' 
        }} 
        data-testid="quality-banner-low"
      >
        <AlertCircle className="h-5 w-5" style={{ color: 'hsl(24 95% 53%)' }} />
        <AlertTitle style={{ color: 'hsl(24 95% 53%)' }}>
          Some Spots May Be Off
        </AlertTitle>
        <AlertDescription style={{ color: 'hsl(24 95% 53% / 0.9)' }}>
          <p className="mb-2">
            {qualityMessage || `We found ${fieldsDetected} spots, but some may be in the wrong place. Check each one before you submit.`}
          </p>
          <div className="flex items-start gap-2 p-2 rounded-md" style={{ backgroundColor: 'hsl(24 95% 53% / 0.1)' }}>
            <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span className="text-sm">
              Tip: A clearer PDF works better. Try a version that is not blurry or sideways.
            </span>
          </div>
        </AlertDescription>
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 h-8 w-8"
          style={{ color: 'hsl(24 95% 53%)' }}
          onClick={handleDismiss}
          data-testid="button-dismiss-quality-banner"
        >
          <X className="h-4 w-4" />
        </Button>
      </Alert>
    );
  }

  return (
    <Alert 
      className="relative" 
      style={{ 
        backgroundColor: 'hsl(var(--destructive) / 0.1)', 
        borderColor: 'hsl(var(--destructive) / 0.3)' 
      }} 
      data-testid="quality-banner-unusable"
    >
      <XCircle className="h-5 w-5" style={{ color: 'hsl(var(--destructive))' }} />
      <AlertTitle style={{ color: 'hsl(var(--destructive))' }}>
        We Could Not Read This PDF
      </AlertTitle>
      <AlertDescription style={{ color: 'hsl(var(--destructive) / 0.9)' }}>
        <p className="mb-2">
          {qualityMessage || `This PDF was too blurry or hard to read. Only ${fieldsDetected} spots were found. Try a clearer copy.`}
        </p>
        <div className="flex items-start gap-2 p-2 rounded-md mb-3" style={{ backgroundColor: 'hsl(var(--destructive) / 0.1)' }}>
          <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span className="text-sm">
            Try to use a clear, straight PDF. Blurry or sideways pages are hard for us to read.
          </span>
        </div>
        {onReupload && (
          <Button
            variant="outline"
            size="sm"
            onClick={onReupload}
            className="mt-1"
            style={{ 
              borderColor: 'hsl(var(--destructive) / 0.5)', 
              color: 'hsl(var(--destructive))' 
            }}
            data-testid="button-reupload-form"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Try a Clearer PDF
          </Button>
        )}
      </AlertDescription>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-8 w-8"
        style={{ color: 'hsl(var(--destructive))' }}
        onClick={handleDismiss}
        data-testid="button-dismiss-quality-banner"
      >
        <X className="h-4 w-4" />
      </Button>
    </Alert>
  );
}
