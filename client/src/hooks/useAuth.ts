import { useQuery } from "@tanstack/react-query";
import type { User, PlanType } from "@shared/schema";

export function useAuth() {
  const { data: user, isLoading } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const planType = user?.planType as PlanType | undefined;
  const isPro = planType === "pro" || planType === "pro_plus" || planType === "team";
  const tier = planType || "guest";

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    isPro,
    tier,
  };
}
