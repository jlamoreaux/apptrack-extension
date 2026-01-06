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
 * Auth token response structure
 */
interface AuthTokenResponse {
  token: string;
  refreshToken?: string;
  expiresAt: number;
  userId: string;
}

/**
 * API client methods
 */
export const api = {
  /**
   * Exchange authorization code for tokens
   * Used in OAuth code flow when extension receives an auth code
   */
  async exchangeAuthCode(authCode: string): Promise<AuthTokenResponse> {
    return request(API_CONFIG.ENDPOINTS.AUTH_TOKEN, {
      method: "POST",
      body: JSON.stringify({ code: authCode }),
      retry: false,
    });
  },

  /**
   * Check if an application already exists
   */
  async checkDuplicate(url: string): Promise<{ exists: boolean; applicationId?: string }> {
    const params = new URLSearchParams({ url });
    return request(`${API_CONFIG.ENDPOINTS.CHECK_DUPLICATE}?${params.toString()}`, {
      method: "GET",
    });
  },

  /**
   * Save a new application
   */
  async saveApplication(data: {
    jobTitle: string;
    company: string;
    jobUrl: string;
    description?: string;
    location?: string;
    salary?: string;
  }): Promise<{ id: string }> {
    return request(API_CONFIG.ENDPOINTS.APPLICATIONS, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  /**
   * Refresh the auth token
   */
  async refreshToken(refreshToken: string): Promise<{ token: string; expiresAt: number }> {
    return request(API_CONFIG.ENDPOINTS.REFRESH_TOKEN, {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
      retry: false,
    });
  },

  /**
   * Validate the current auth token
   * Returns user info if valid, throws if invalid
   */
  async validateToken(): Promise<{ userId: string; email?: string }> {
    return request("/auth/validate", {
      method: "GET",
      retry: false,
    });
  },
};
