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
  refreshToken?: string;
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
  | "error";

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
  | "LOGOUT";

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
  status?: "saved" | "applied" | "interviewing" | "offered" | "rejected";
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
