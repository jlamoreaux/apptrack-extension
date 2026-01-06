/**
 * Typed message passing between extension components
 */

import browser from "webextension-polyfill";
import type { MessageType, MessageResponse, JobData, AuthState } from "@/shared/types";

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
  async getAuthState(): Promise<AuthState> {
    const response = await sendToBackground<AuthState>("GET_AUTH_STATE");
    return response.data ?? { isAuthenticated: false };
  },

  /**
   * Extract job data from the current page
   */
  async extractJobData(): Promise<JobData | null> {
    const response = await sendToContentScript<JobData>("EXTRACT_JOB_DATA");
    return response.success ? response.data ?? null : null;
  },

  /**
   * Save a job application
   */
  async saveApplication(jobData: JobData): Promise<MessageResponse<{ id: string }>> {
    return sendToBackground("SAVE_APPLICATION", jobData);
  },

  /**
   * Check if a job is already tracked
   */
  async checkDuplicate(url: string): Promise<{ exists: boolean; applicationId?: string }> {
    const response = await sendToBackground<{ exists: boolean; applicationId?: string }>(
      "CHECK_DUPLICATE",
      { url }
    );
    return response.data ?? { exists: false };
  },
};
