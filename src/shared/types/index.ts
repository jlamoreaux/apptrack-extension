/**
 * Shared TypeScript types for the AppTrack extension
 */

/**
 * Job data extracted from a job posting page
 */
export interface JobData {
  title: string | null;
  company: string | null;
  url: string;
  description?: string | null;
  location?: string | null;
  salary?: string | null;
  jobType?: string | null;
  postedDate?: string | null;
}

/**
 * Authentication state stored in extension storage
 */
export interface AuthState {
  isAuthenticated: boolean;
  token?: string;
  expiresAt?: number;
  userId?: string;
}

/**
 * Possible states of the extension popup UI
 */
export type ExtensionState =
  | "logged_out"
  | "no_job"
  | "job_detected"
  | "already_tracked"
  | "success"
  | "error"
  | "settings";

/**
 * User-configurable extension settings
 */
export interface ExtensionSettings {
  autoDetect: boolean;
  showNotifications: boolean;
  analyticsOptOut: boolean;
  /** When true, the content script runs on all websites, not just the curated job board list */
  fullSiteAccess: boolean;
  autoAnalysis: boolean;
  badgeDisplay: "score" | "indicator" | "off";
}

/** Job fit result from the API */
export interface JobFitResult {
  overallScore: number;
  summary: string;
  keyStrengths?: string[];
  areasForImprovement?: string[];
}

/** Cache entry for a specific URL */
export interface JobFitCacheEntry {
  result?: JobFitResult;
  errorCode?: "no_resume" | "upgrade_required" | "error";
  cachedAt: number; // unix timestamp ms
}

/** Status of auto job fit analysis for a tab */
export type JobFitStatus =
  | "idle" // not yet triggered
  | "loading" // API call in progress
  | "ready" // score available
  | "no_resume" // Pro user but no resume uploaded
  | "upgrade_required" // free user
  | "error"; // analysis failed

/**
 * Message types for communication between extension components
 */
export type MessageType =
  | "GET_AUTH_STATE"
  | "SET_AUTH_STATE"
  | "GET_JOB_DATA"
  | "EXTRACT_JOB_DATA"
  | "SAVE_APPLICATION"
  | "CHECK_DUPLICATE"
  | "REFRESH_TOKEN"
  | "LOGOUT"
  | "ENABLE_FULL_SITE_ACCESS"
  | "DISABLE_FULL_SITE_ACCESS"
  | "GET_FULL_SITE_STATUS"
  | "GET_JOB_FIT"
  | "CLEAR_JOB_FIT_CACHE";

/**
 * Base message structure
 */
export interface ExtensionMessage {
  type: MessageType;
  payload?: unknown;
}

/**
 * Response structure from message handlers
 */
export interface MessageResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Application to be saved via API
 */
export interface ApplicationPayload {
  jobTitle: string;
  company: string;
  jobUrl: string;
  description?: string;
  location?: string;
  salary?: string;
  notes?: string;
}

/**
 * API error response
 */
export interface ApiError {
  message: string;
  code?: string;
  status?: number;
}
