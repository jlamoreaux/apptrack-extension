/**
 * Typed message passing between extension components
 */

import browser from "webextension-polyfill";
import type { MessageType, MessageResponse, JobData, AuthState, ApplicationPayload } from "@/shared/types";

/**
 * Send a message to the background script
 */
export async function sendToBackground<T = unknown>(
  type: MessageType,
  payload?: unknown
): Promise<MessageResponse<T>> {
  try {
    const response = await browser.runtime.sendMessage({ type, payload });
    return response as MessageResponse<T>;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Send a message to the content script in the active tab
 */
export async function sendToContentScript<T = unknown>(
  type: MessageType,
  payload?: unknown
): Promise<MessageResponse<T>> {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id;

    if (!tabId) {
      return { success: false, error: "No active tab" };
    }

    const response = await browser.tabs.sendMessage(tabId, { type, payload });
    return response as MessageResponse<T>;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Helper functions for common message types
 */
export const messages = {
  /**
   * Get the current auth state
   */
  async getAuthState(): Promise<AuthState & { expiresAt?: number }> {
    const response = await sendToBackground<AuthState & { expiresAt?: number }>("GET_AUTH_STATE");
    return response.data ?? { isAuthenticated: false };
  },

  /**
   * Set auth state (after OAuth flow)
   */
  async setAuthState(authData: {
    token: string;
    expiresAt: number;
    userId: string;
  }): Promise<{ success: boolean; error?: string }> {
    const response = await sendToBackground<{ success: boolean; error?: string }>(
      "SET_AUTH_STATE",
      authData
    );
    return { success: response.success ?? false, error: response.error };
  },

  /**
   * Logout and clear auth state
   */
  async logout(): Promise<{ success: boolean }> {
    const response = await sendToBackground<{ success: boolean }>("LOGOUT");
    return { success: response.success ?? false };
  },

  /**
   * Manually trigger token refresh
   */
  async refreshToken(): Promise<{ success: boolean; error?: string }> {
    const response = await sendToBackground<{ success: boolean; error?: string }>("REFRESH_TOKEN");
    return { success: response.success ?? false, error: response.error };
  },

  /**
   * Get job data from the current tab
   */
  async getJobData(): Promise<{ success: boolean; data?: JobData; error?: string }> {
    const response = await sendToBackground<JobData>("GET_JOB_DATA");
    return {
      success: response.success ?? false,
      data: response.data,
      error: response.error,
    };
  },

  /**
   * Extract job data from the current page (via content script)
   */
  async extractJobData(): Promise<JobData | null> {
    const response = await sendToContentScript<JobData>("EXTRACT_JOB_DATA");
    return response.success ? response.data ?? null : null;
  },

  /**
   * Save a job application
   */
  async saveApplication(
    data: ApplicationPayload
  ): Promise<{ success: boolean; id?: string; queued?: boolean; error?: string }> {
    const response = await sendToBackground<{ id?: string; queued?: boolean }>(
      "SAVE_APPLICATION",
      data
    );
    return {
      success: response.success ?? false,
      id: response.data?.id,
      queued: response.data?.queued,
      error: response.error,
    };
  },

  /**
   * Check if a job is already tracked by company and role
   */
  async checkDuplicate(
    company: string,
    role: string
  ): Promise<{ success: boolean; exists?: boolean; applicationId?: string; error?: string }> {
    const response = await sendToBackground<{ exists: boolean; applicationId?: string }>(
      "CHECK_DUPLICATE",
      { company, role }
    );
    return {
      success: response.success ?? false,
      exists: response.data?.exists,
      applicationId: response.data?.applicationId,
      error: response.error,
    };
  },

  /**
   * Enable full-site access (requests optional permission + registers content script)
   */
  async enableFullSiteAccess(): Promise<{ success: boolean }> {
    const response = await sendToBackground<{ success: boolean }>("ENABLE_FULL_SITE_ACCESS");
    return { success: response.success ?? false };
  },

  /**
   * Disable full-site access (removes permission + unregisters content script)
   */
  async disableFullSiteAccess(): Promise<{ success: boolean }> {
    const response = await sendToBackground<{ success: boolean }>("DISABLE_FULL_SITE_ACCESS");
    return { success: response.success ?? false };
  },

  /**
   * Check if full-site access permission is currently active
   */
  async getFullSiteStatus(): Promise<boolean> {
    const response = await sendToBackground<{ enabled: boolean }>("GET_FULL_SITE_STATUS");
    return response.data?.enabled ?? false;
  },
};
