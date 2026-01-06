/**
 * Background Service Worker
 * Handles messaging, auth state, API calls, and icon updates
 */

import browser from "webextension-polyfill";
import { storage } from "@/shared/utils/storage";

// Initialize on install
browser.runtime.onInstalled.addListener(() => {
  console.warn("[AppTrack] Extension installed");
});

/**
 * Message handler for popup and content script communication
 * Uses Promise-based approach for reliable async responses
 */
browser.runtime.onMessage.addListener(
  (message: { type: string; payload?: unknown }, _sender): Promise<unknown> | undefined => {
    // Handle messages that need async responses
    switch (message.type) {
      case "GET_AUTH_STATE":
        return handleGetAuthState();
      case "GET_JOB_DATA":
        return handleGetJobData();
      case "SAVE_APPLICATION":
        return handleSaveApplication(message.payload);
      case "CHECK_DUPLICATE":
        return handleCheckDuplicate(message.payload);
      default:
        // Return undefined for unknown messages (allows other listeners to handle)
        return undefined;
    }
  }
);

/**
 * Get current authentication state
 */
async function handleGetAuthState(): Promise<{ isAuthenticated: boolean; userId?: string }> {
  try {
    const authState = await storage.getAuthState();
    return {
      isAuthenticated: authState.isAuthenticated,
      userId: authState.userId,
    };
  } catch (error) {
    console.error("[AppTrack] Error getting auth state:", error);
    return { isAuthenticated: false };
  }
}

/**
 * Get job data from the active tab's content script
 */
async function handleGetJobData(): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id;

    if (!tabId) {
      return { success: false, error: "No active tab" };
    }

    const response = await browser.tabs.sendMessage(tabId, { type: "EXTRACT_JOB_DATA" });
    return { success: true, data: response };
  } catch (error) {
    console.error("[AppTrack] Error getting job data:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Save a job application
 */
async function handleSaveApplication(
  _payload: unknown
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    // TODO: Implement API call when endpoints are ready
    // const result = await api.saveApplication(payload);
    return { success: false, error: "Not implemented" };
  } catch (error) {
    console.error("[AppTrack] Error saving application:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Check if a job URL is already tracked
 */
async function handleCheckDuplicate(
  payload: unknown
): Promise<{ success: boolean; exists?: boolean; error?: string }> {
  try {
    const { url } = payload as { url: string };
    if (!url) {
      return { success: false, error: "URL required" };
    }
    // TODO: Implement API call when endpoints are ready
    // const result = await api.checkDuplicate(url);
    return { success: true, exists: false };
  } catch (error) {
    console.error("[AppTrack] Error checking duplicate:", error);
    return { success: false, error: String(error) };
  }
}

export {};
