/**
 * Analytics integration using PostHog
 * Privacy-respecting: no PII, domain-only tracking, opt-out support
 */

import { ANALYTICS_CONFIG, STORAGE_KEYS } from "@/shared/constants";
import { storage } from "./storage";

let isOptedOut = false;
let isInitialized = false;

/**
 * Initialize analytics
 */
export async function initAnalytics(): Promise<void> {
  if (isInitialized) return;

  // Check opt-out status
  const optOut = await storage.get<boolean>(STORAGE_KEYS.ANALYTICS_OPT_OUT);
  isOptedOut = optOut ?? false;
  isInitialized = true;

  if (!isOptedOut && ANALYTICS_CONFIG.POSTHOG_KEY) {
    // PostHog would be initialized here in production
    // eslint-disable-next-line no-console
    console.log("[AppTrack Analytics] Initialized");
  }
}

/**
 * Track an event
 */
export async function track(event: string, properties?: Record<string, unknown>): Promise<void> {
  if (!isInitialized) {
    await initAnalytics();
  }

  if (isOptedOut || !ANALYTICS_CONFIG.POSTHOG_KEY) {
    return;
  }

  // Sanitize properties - remove any potential PII
  const sanitizedProps = sanitizeProperties(properties);

  // eslint-disable-next-line no-console
  console.log("[AppTrack Analytics] Track:", event, sanitizedProps);

  // In production, this would send to PostHog:
  // posthog.capture(event, sanitizedProps);
}

/**
 * Sanitize event properties to remove PII
 */
function sanitizeProperties(properties?: Record<string, unknown>): Record<string, unknown> {
  if (!properties) return {};

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(properties)) {
    // Only include safe properties
    if (isSafeProperty(key, value)) {
      // Extract domain only from URLs
      if (key === "url" && typeof value === "string") {
        try {
          sanitized.domain = new URL(value).hostname;
        } catch {
          sanitized.domain = "unknown";
        }
      } else {
        sanitized[key] = value;
      }
    }
  }

  return sanitized;
}

/**
 * Check if a property is safe to track
 */
function isSafeProperty(key: string, value: unknown): boolean {
  // Blocklist of potentially PII keys
  const blockedKeys = ["email", "name", "user", "token", "password", "phone"];

  if (blockedKeys.some((blocked) => key.toLowerCase().includes(blocked))) {
    return false;
  }

  // Only allow primitive values
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

/**
 * Set opt-out status
 */
export async function setOptOut(optOut: boolean): Promise<void> {
  isOptedOut = optOut;
  await storage.set(STORAGE_KEYS.ANALYTICS_OPT_OUT, optOut);
}

/**
 * Pre-defined events for consistency
 */
export const AnalyticsEvents = {
  // Auth events
  AUTH_STARTED: "auth_started",
  AUTH_COMPLETED: "auth_completed",
  AUTH_FAILED: "auth_failed",

  // Job detection events
  JOB_DETECTED: "job_detected",
  JOB_NOT_DETECTED: "job_not_detected",

  // Extraction events
  EXTRACTION_SUCCESS: "extraction_success",
  EXTRACTION_PARTIAL: "extraction_partial",
  EXTRACTION_FAILED: "extraction_failed",

  // Save events
  SAVE_STARTED: "save_started",
  SAVE_COMPLETED: "save_completed",
  SAVE_FAILED: "save_failed",

  // UI events
  POPUP_OPENED: "popup_opened",
  FIELD_EDITED: "field_edited",
} as const;

export const analytics = {
  init: initAnalytics,
  track,
  setOptOut,
  events: AnalyticsEvents,
};
