/**
 * useLicense — reads the local license status from the desktop server.
 *
 * The desktop server checks SQLite (no network needed after first activation).
 * Refreshes every 60 seconds so expiry is caught promptly.
 */
import { useQuery } from "@tanstack/react-query";

export interface LicenseStatus {
  status: "unactivated" | "active" | "expired" | "invalid";
  licenseKey?: string;
  email?: string;
  plan?: string;
  expiresAt?: string | null;
  activatedAt?: string | null;
  daysUntilExpiry?: number | null;
  trialUsed: number;
  trialLimit: number;
  trialRemaining: number;
}

export function useLicense() {
  const { data, isLoading, refetch } = useQuery<LicenseStatus>({
    queryKey: ["/api/license/status"],
    refetchInterval: 60_000,
    retry: false,
  });

  const isActive   = data?.status === "active";
  const isExpired  = data?.status === "expired";
  const inTrial    = !isActive && (data?.trialRemaining ?? 0) > 0;
  const isGated    = !isActive && !inTrial;   // trial exhausted AND not licensed
  const trialRemaining = data?.trialRemaining ?? 0;
  const trialLimit     = data?.trialLimit ?? 3;

  return {
    license: data,
    isLoading,
    isActive,
    isExpired,
    inTrial,
    isGated,       // true = show paywall
    trialRemaining,
    trialLimit,
    refetch,
  };
}
