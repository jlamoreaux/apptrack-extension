/**
 * Typed message passing between extension components
 */

import type {
  MessageType,
  ExtensionMessage,
  MessageResponse,
  JobData,
  AuthState,
} from "@/shared/types";

/**
 * Send a message to the background script
 */
export async function sendToBackground<T = unknown>(
  type: MessageType,
  payload?: unknown
): Promise<MessageResponse<T>> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, payload }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({
          success: false,
          error: chrome.runtime.lastError.message,
        });
      } else {
        resolve(response as MessageResponse<T>);
      }
    });
  });
}

/**
 * Send a message to the content script in the active tab
 */
export async function sendToContentScript<T = unknown>(
  type: MessageType,
  payload?: unknown
): Promise<MessageResponse<T>> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId) {
        resolve({ success: false, error: "No active tab" });
        return;
      }

      chrome.tabs.sendMessage(tabId, { type, payload }, (response) => {
        if (chrome.runtime.lastError) {
          resolve({
            success: false,
            error: chrome.runtime.lastError.message,
          });
        } else {
          resolve(response as MessageResponse<T>);
        }
      });
    });
  });
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
