/**
 * API client for AppTrack backend
 */

import type { ApiError } from "@/shared/types";
import { API_CONFIG } from "@/shared/constants";
import { storage } from "./storage";

interface RequestOptions extends RequestInit {
  timeout?: number;
  retry?: boolean;
}

/**
 * Make an API request with automatic token injection and retry logic
 */
async function request<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { timeout = API_CONFIG.TIMEOUT, retry = true, ...fetchOptions } = options;

  // Get auth token
  const authState = await storage.getAuthState();
  const headers = new Headers(fetchOptions.headers);

  if (authState.token) {
    headers.set("Authorization", `Bearer ${authState.token}`);
  }
  headers.set("Content-Type", "application/json");

  const url = `${API_CONFIG.BASE_URL}${endpoint}`;

  let lastError: Error | null = null;
  const attempts = retry ? API_CONFIG.RETRY_ATTEMPTS : 1;

  for (let attempt = 0; attempt < attempts; attempt++) {
    // Create fresh AbortController for each attempt
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as Partial<ApiError>;
        throw new ApiClientError(
          errorData.message ?? `HTTP ${response.status}`,
          errorData.code,
          response.status
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on client errors (4xx) or abort
      if (
        error instanceof ApiClientError &&
        error.status &&
        error.status >= 400 &&
        error.status < 500
      ) {
        throw error;
      }

      if (error instanceof DOMException && error.name === "AbortError") {
        throw new ApiClientError("Request timeout", "TIMEOUT");
      }

      // Wait before retry with exponential backoff
      if (attempt < attempts - 1) {
        await sleep(API_CONFIG.RETRY_DELAY * Math.pow(2, attempt));
      }
    }
  }

  throw lastError ?? new Error("Request failed");
}

/**
 * Custom error class for API errors
 */
export class ApiClientError extends Error {
  code?: string;
  status?: number;

  constructor(message: string, code?: string, status?: number) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Auth token response from backend (initial auth handoff)
 */
export interface AuthTokenResponse {
  token: string;
  expiresAt: string; // ISO date string
  user: {
    id: string;
    email: string;
    name: string;
  };
}

/**
 * Token refresh response from backend (subset — no user object)
 */
export interface RefreshTokenResponse {
  token: string;
  expiresAt: string; // ISO date string
}

/**
 * API client methods
 */
export const api = {
  /**
   * Check if an application already exists by company and role
   */
  async checkDuplicate(company: string, role: string): Promise<{ exists: boolean; applicationId?: string }> {
    const params = new URLSearchParams({ company, role });
    return request(`${API_CONFIG.ENDPOINTS.CHECK_DUPLICATE}?${params.toString()}`, {
      method: "GET",
    });
  },

  /**
   * Save a new application
   * Maps extension fields to backend expected format
   */
  async saveApplication(data: {
    jobTitle: string;
    company: string;
    jobUrl: string;
    description?: string;
    location?: string;
    salary?: string;
  }): Promise<{ id: string }> {
    // Build notes from location and salary if present
    const notesParts: string[] = [];
    if (data.location) notesParts.push(`Location: ${data.location}`);
    if (data.salary) notesParts.push(`Salary: ${data.salary}`);

    return request(API_CONFIG.ENDPOINTS.APPLICATIONS, {
      method: "POST",
      body: JSON.stringify({
        role: data.jobTitle,
        company: data.company,
        role_link: data.jobUrl,
        job_description: data.description ?? "",
        date_applied: new Date().toISOString(),
        notes: notesParts.length > 0 ? notesParts.join("\n") : undefined,
      }),
    });
  },

  /**
   * Refresh the auth token
   * Uses Authorization header (injected by request()) — no body needed
   */
  async refreshToken(): Promise<RefreshTokenResponse> {
    return request(API_CONFIG.ENDPOINTS.REFRESH_TOKEN, {
      method: "POST",
      retry: false,
    });
  },

  /**
   * Validate the current auth token
   * Returns user info if valid, throws if invalid
   */
  async validateToken(): Promise<{ userId: string; email?: string }> {
    return request(API_CONFIG.ENDPOINTS.VALIDATE_TOKEN, {
      method: "GET",
      retry: false,
    });
  },
};
