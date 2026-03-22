/**
 * Constants and configuration for the AppTrack extension
 */

/**
 * API configuration
 */
export const API_CONFIG = {
  BASE_URL: "https://apptrack.ing/api",
  ENDPOINTS: {
    AUTH_TOKEN: "/auth/extension-token",
    REFRESH_TOKEN: "/auth/refresh-extension-token",
    VALIDATE_TOKEN: "/auth/validate",
    CHECK_DUPLICATE: "/applications/check-duplicate",
    APPLICATIONS: "/applications",
    JOB_FIT: "/ai-coach/job-fit",
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
  JOB_FIT_CACHE: "apptrack_job_fit_cache",
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
 * Job fit analysis configuration
 */
export const JOB_FIT_CONFIG = {
  CACHE_TTL: 24 * 60 * 60 * 1000, // 24 hours in ms
  DWELL_DELAY_MS: 3000,             // 3s debounce before analysis fires
} as const;

/**
 * Extension icon states
 */
export const ICON_STATES = {
  DEFAULT: "gray",
  AUTHENTICATED: "blue",
  JOB_DETECTED: "green",
  ALREADY_TRACKED: "yellow",
} as const;

/**
 * Analytics configuration
 */
export const ANALYTICS_CONFIG = {
  POSTHOG_KEY: "phc_bM8tEi7i4wnNriDktLmbqdkWPQeqFAnaMYHrpkBi73E",
  POSTHOG_HOST: "https://app.posthog.com",
} as const;

/**
 * Default settings
 */
export const DEFAULT_SETTINGS = {
  autoDetect: true,
  showNotifications: true,
  analyticsOptOut: false,
  fullSiteAccess: false,
  autoAnalysis: true,
  badgeDisplay: "score" as "score" | "indicator" | "off",
} as const;

/**
 * Curated list of job board and ATS domains for the default content script.
 * Covers the vast majority of job applications without requiring <all_urls>.
 * Users can opt into full-site access via extension settings.
 */
export const JOB_BOARD_MATCHES = [
  // Major job boards
  "*://*.linkedin.com/jobs/*",
  "*://*.indeed.com/*",
  "*://*.glassdoor.com/*",
  "*://*.ziprecruiter.com/*",
  "*://*.monster.com/*",
  "*://www.dice.com/*",
  "*://*.simplyhired.com/*",
  "*://wellfound.com/*",
  "*://angel.co/*",
  "*://*.hired.com/*",
  "*://www.careerbuilder.com/*",
  "*://*.handshake.com/*",
  // ATS platforms (company career pages)
  "*://boards.greenhouse.io/*",
  "*://jobs.lever.co/*",
  "*://*.myworkdayjobs.com/*",
  "*://*.icims.com/*",
  "*://*.taleo.net/*",
  "*://*.bamboohr.com/*",
  "*://*.smartrecruiters.com/*",
  "*://*.jobvite.com/*",
  "*://jobs.ashbyhq.com/*",
  "*://apply.workable.com/*",
  "*://*.breezy.hr/*",
  "*://*.recruitee.com/*",
  "*://*.applytojob.com/*",
  "*://*.rippling.com/*",
  "*://*.paylocity.com/*",
  "*://*.successfactors.com/*",
  "*://*.paycom.com/*",
  // AppTrack itself
  "*://apptrack.ing/*",
  "*://*.apptrack.ing/*",
] as const;

/**
 * ID used when dynamically registering the full-site content script.
 */
export const FULL_SITE_SCRIPT_ID = "apptrack-allurls-content";

/**
 * Optional host permission that enables the extension on all websites.
 */
export const FULL_SITE_ORIGIN = "<all_urls>";
