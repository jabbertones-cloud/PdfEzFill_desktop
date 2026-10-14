import ReactGA from "react-ga4";

const GA_MEASUREMENT_ID = import.meta.env.VITE_GAID;

let initialized = false;

export const initGA = () => {
  if (initialized || !GA_MEASUREMENT_ID) {
    if (!GA_MEASUREMENT_ID) {
      console.warn("[analytics] VITE_GAID not set, analytics disabled");
    }
    return;
  }

  try {
    ReactGA.initialize(GA_MEASUREMENT_ID, {
      gaOptions: {
        anonymize_ip: true,
      },
    });
    initialized = true;
    console.log("[analytics] Google Analytics initialized");
  } catch (error) {
    console.error("[analytics] Failed to initialize:", error);
  }
};

export const trackPageView = (path: string, title?: string) => {
  if (!initialized) return;
  
  const cleanPath = sanitizePath(path);
  ReactGA.send({
    hitType: "pageview",
    page: cleanPath,
    title: title || document.title,
  });
};

export const trackEvent = (
  category: string,
  action: string,
  label?: string,
  value?: number
) => {
  if (!initialized) return;
  
  ReactGA.event({
    category,
    action,
    label,
    value,
  });
};

export const trackFormUpload = (fileName: string, pageCount: number) => {
  trackEvent("Form", "upload", fileName, pageCount);
};

export const trackFormComplete = (formId: string) => {
  trackEvent("Form", "complete", formId);
};

export const trackFormDownload = (formId: string) => {
  trackEvent("Form", "download", formId);
};

export const trackPaymentStart = (planType: string, amount: number) => {
  trackEvent("Payment", "start", planType, amount);
};

export const trackPaymentSuccess = (planType: string, amount: number) => {
  trackEvent("Payment", "success", planType, amount);
};

export const trackSubscription = (action: "start" | "cancel" | "upgrade", planType: string) => {
  trackEvent("Subscription", action, planType);
};

export const trackUserSignup = () => {
  trackEvent("User", "signup");
};

export const trackUserLogin = () => {
  trackEvent("User", "login");
};

export const trackProfileCreate = () => {
  trackEvent("Profile", "create");
};

export const trackSignatureCreate = () => {
  trackEvent("Signature", "create");
};

export const trackOCRQuality = (quality: "high" | "medium" | "low" | "unusable") => {
  trackEvent("OCR", "quality", quality);
};

export const trackError = (errorType: string, errorMessage: string) => {
  trackEvent("Error", errorType, errorMessage);
};

const sanitizePath = (path: string): string => {
  const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;
  return path.replace(UUID_REGEX, "[id]");
};

export const generateUTMParams = (
  source: string,
  medium: string,
  campaign: string,
  content?: string
): string => {
  const params = new URLSearchParams({
    utm_source: source,
    utm_medium: medium,
    utm_campaign: campaign,
  });
  if (content) {
    params.append("utm_content", content);
  }
  return params.toString();
};

export const getEmailTrackingUrl = (
  baseUrl: string,
  campaign: string,
  content?: string
): string => {
  const utmParams = generateUTMParams("email", "automation", campaign, content);
  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}${utmParams}`;
};
