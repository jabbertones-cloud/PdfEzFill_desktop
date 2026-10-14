export const PRICING = {
  guest: {
    price: 5,
    priceDisplay: "$5",
    pricePerForm: "$5/form",
  },
  trial: {
    price: 1,
    priceDisplay: "$1",
    pricePerForm: "$1 trial",
  },
  starter: {
    price: 7,
    priceDisplay: "$7",
    pricePerMonth: "$7/month",
    formsIncluded: 2,
    profiles: 1,
    extraFormPrice: 2,
    extraFormDisplay: "$2",
    retentionDays: 180,
    displayName: "Starter",
    dbTier: "pro" as const,
  },
  pro_plus: {
    price: 15,
    priceDisplay: "$15",
    pricePerMonth: "$15/month",
    formsIncluded: 10,
    profiles: "unlimited",
    extraFormPrice: 2,
    extraFormDisplay: "$2",
    retentionDays: 180,
    displayName: "Pro+",
    dbTier: "pro_plus" as const,
  },
  enterprise: {
    price: 49,
    priceDisplay: "$49",
    pricePerMonth: "$49/month",
    formsIncluded: 50,
    profiles: "unlimited",
    extraFormPrice: 1.5,
    extraFormDisplay: "$1.50",
    retentionDays: 180,
    displayName: "Enterprise",
    dbTier: "team" as const,
  },
  regeneration: {
    price: 2,
    priceDisplay: "$2",
  },
} as const;

export type DbPlanType = "pro" | "pro_plus" | "team" | "none" | "guest" | "starter";
export type PlanTier = DbPlanType;

export function getPlanConfig(tier: DbPlanType) {
  switch (tier) {
    case "pro":
    case "starter":
      return PRICING.starter;
    case "pro_plus":
      return PRICING.pro_plus;
    case "team":
      return PRICING.enterprise;
    default:
      return null;
  }
}

export function getPlanDisplayName(tier: DbPlanType): string {
  switch (tier) {
    case "pro":
    case "starter":
      return "Starter";
    case "pro_plus":
      return "Pro+";
    case "team":
      return "Enterprise";
    case "guest":
      return "Guest";
    default:
      return "Free";
  }
}

export function getPlanPrice(tier: DbPlanType): number {
  const config = getPlanConfig(tier);
  return config?.price || 0;
}

export function getExtraFormPrice(tier: DbPlanType): number {
  const config = getPlanConfig(tier);
  return config?.extraFormPrice || PRICING.guest.price;
}

export function isPaidTier(tier: DbPlanType): boolean {
  return tier === "pro" || tier === "pro_plus" || tier === "team";
}
