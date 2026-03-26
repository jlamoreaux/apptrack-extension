/**
 * Constants and configuration for the AppTrack extension
 */

/**
 * Base URL for the AppTrack web app (canonical domain)
 */
export const APP_URL = "https://www.apptrack.ing";

/**
 * API configuration
 */
export const API_CONFIG = {
  BASE_URL: `${APP_URL}/api`,
  ENDPOINTS: {
    AUTH_TOKEN: "/auth/extension-token",
    REFRESH_TOKEN: "/auth/refresh-extension-token",
    VALIDATE_TOKEN: "/auth/validate",
    CHECK_DUPLICATE: "/applications/check-duplicate",
    APPLICATIONS: "/applications",
  },
  TIMEOUT: 10000,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
} as const;

/**
 * Storage keys for chrome.storage.local
 */
export const STORAGE_KEYS = {
  AUTH_STATE: "apptrack_auth_state",
  PENDING_SAVES: "apptrack_pending_saves",
  SETTINGS: "apptrack_settings",
  ANALYTICS_OPT_OUT: "apptrack_analytics_opt_out",
  BANNER_DISMISSED: "apptrack_banner_dismissed",
} as const;

/**
 * Token configuration
 */
export const TOKEN_CONFIG = {
  /** Token expiry time in days */
  EXPIRY_DAYS: 30,
  /** Refresh token before expiry (in milliseconds) */
  REFRESH_BEFORE_EXPIRY: 24 * 60 * 60 * 1000, // 1 day
  /** Alarm name for token refresh */
  REFRESH_ALARM_NAME: "apptrack_token_refresh",
} as const;

/**
 * Extension icon states
 */
export const ICON_STATES = {
  DEFAULT: "gray",
  AUTHENTICATED: "blue",
} as const;

/**
 * Analytics configuration
 */
export const ANALYTICS_CONFIG = {
  POSTHOG_KEY: "", // To be configured
  POSTHOG_HOST: "https://app.posthog.com",
} as const;

/**
 * Default settings
 */
export const DEFAULT_SETTINGS = {
  autoDetect: true,
  showNotifications: true,
  analyticsOptOut: false,
} as const;
