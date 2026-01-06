/**
 * Background Service Worker
 * Handles messaging, auth state, API calls, icon updates, and token refresh
 */

import browser from "webextension-polyfill";
import { storage } from "@/shared/utils/storage";
import { api, ApiClientError } from "@/shared/utils/api";
import {
  ICON_STATES,
  TOKEN_CONFIG,
  STORAGE_KEYS,
} from "@/shared/constants";
import type { JobData, ApplicationPayload } from "@/shared/types";

// ============================================================================
// Types
// ============================================================================

type IconState = (typeof ICON_STATES)[keyof typeof ICON_STATES];

interface PendingSave {
  id: string;
  data: ApplicationPayload;
  timestamp: number;
  retries: number;
}

interface TabState {
  hasJob: boolean;
  jobData?: JobData;
  isDuplicate?: boolean;
}

// Track state per tab
const tabStates = new Map<number, TabState>();

// ============================================================================
// Initialization
// ============================================================================

// Initialize on install
browser.runtime.onInstalled.addListener(async (details) => {
  console.warn("[AppTrack] Extension installed:", details.reason);

  // Set default icon state
  await updateIconState(ICON_STATES.DEFAULT);

  // Setup token refresh alarm if authenticated
  await setupTokenRefreshAlarm();
});

// Initialize on startup
browser.runtime.onStartup.addListener(async () => {
  console.warn("[AppTrack] Extension started");

  // Restore icon state based on auth
  const authState = await storage.getAuthState();
  await updateIconState(
    authState.isAuthenticated ? ICON_STATES.AUTHENTICATED : ICON_STATES.DEFAULT
  );

  // Setup token refresh alarm
  await setupTokenRefreshAlarm();

  // Process any pending saves
  await processPendingSaves();
});

// ============================================================================
// Icon Badge Management
// ============================================================================

/**
 * Update the extension icon based on state
 */
async function updateIconState(state: IconState, tabId?: number): Promise<void> {
  const badgeColors: Record<IconState, string> = {
    [ICON_STATES.DEFAULT]: "#9CA3AF", // gray-400
    [ICON_STATES.AUTHENTICATED]: "#3B82F6", // blue-500
    [ICON_STATES.JOB_DETECTED]: "#22C55E", // green-500
    [ICON_STATES.ALREADY_TRACKED]: "#EAB308", // yellow-500
  };

  const badgeText: Record<IconState, string> = {
    [ICON_STATES.DEFAULT]: "",
    [ICON_STATES.AUTHENTICATED]: "",
    [ICON_STATES.JOB_DETECTED]: "+",
    [ICON_STATES.ALREADY_TRACKED]: "✓",
  };

  try {
    const options = tabId ? { tabId } : {};

    await browser.action.setBadgeBackgroundColor({
      ...options,
      color: badgeColors[state],
    });

    await browser.action.setBadgeText({
      ...options,
      text: badgeText[state],
    });
  } catch (error) {
    console.error("[AppTrack] Error updating icon:", error);
  }
}

/**
 * Update icon for a specific tab based on job detection
 */
async function updateTabIcon(tabId: number): Promise<void> {
  const authState = await storage.getAuthState();

  if (!authState.isAuthenticated) {
    await updateIconState(ICON_STATES.DEFAULT, tabId);
    return;
  }

  const tabState = tabStates.get(tabId);

  if (!tabState?.hasJob) {
    await updateIconState(ICON_STATES.AUTHENTICATED, tabId);
  } else if (tabState.isDuplicate) {
    await updateIconState(ICON_STATES.ALREADY_TRACKED, tabId);
  } else {
    await updateIconState(ICON_STATES.JOB_DETECTED, tabId);
  }
}

// ============================================================================
// Token Refresh
// ============================================================================

/**
 * Setup alarm for token refresh
 */
async function setupTokenRefreshAlarm(): Promise<void> {
  const authState = await storage.getAuthState();

  if (!authState.isAuthenticated || !authState.expiresAt) {
    // Clear any existing alarm
    await browser.alarms.clear(TOKEN_CONFIG.REFRESH_ALARM_NAME);
    return;
  }

  // Calculate when to refresh (1 day before expiry)
  const refreshTime = authState.expiresAt - TOKEN_CONFIG.REFRESH_BEFORE_EXPIRY;
  const now = Date.now();

  if (refreshTime <= now) {
    // Token needs refresh now
    await refreshAuthToken();
  } else {
    // Schedule refresh
    await browser.alarms.create(TOKEN_CONFIG.REFRESH_ALARM_NAME, {
      when: refreshTime,
    });
  }
}

/**
 * Handle alarm events
 */
browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === TOKEN_CONFIG.REFRESH_ALARM_NAME) {
    await refreshAuthToken();
  }
});

/**
 * Refresh the authentication token
 */
async function refreshAuthToken(): Promise<boolean> {
  try {
    const authState = await storage.getAuthState();

    if (!authState.refreshToken) {
      console.warn("[AppTrack] No refresh token available");
      await handleLogout();
      return false;
    }

    const result = await api.refreshToken(authState.refreshToken);

    await storage.setAuthState({
      ...authState,
      token: result.token,
      expiresAt: result.expiresAt,
    });

    // Setup next refresh alarm
    await setupTokenRefreshAlarm();

    console.warn("[AppTrack] Token refreshed successfully");
    return true;
  } catch (error) {
    console.error("[AppTrack] Token refresh failed:", error);

    if (error instanceof ApiClientError && error.status === 401) {
      // Refresh token is invalid, logout
      await handleLogout();
    }

    return false;
  }
}

/**
 * Handle logout - clear auth state and update icon
 */
async function handleLogout(): Promise<void> {
  await storage.clearAuthState();
  await browser.alarms.clear(TOKEN_CONFIG.REFRESH_ALARM_NAME);
  await updateIconState(ICON_STATES.DEFAULT);
}

// ============================================================================
// Tab Listeners
// ============================================================================

/**
 * Listen for tab updates to detect job pages
 */
browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only act on complete page loads with a URL
  if (changeInfo.status !== "complete" || !tab.url) {
    return;
  }

  // Skip non-http(s) pages
  if (!tab.url.startsWith("http")) {
    tabStates.delete(tabId);
    await updateTabIcon(tabId);
    return;
  }

  // Check auth state first
  const authState = await storage.getAuthState();
  if (!authState.isAuthenticated) {
    return;
  }

  // Try to extract job data from the page
  try {
    const response = await browser.tabs.sendMessage(tabId, {
      type: "EXTRACT_JOB_DATA",
    });

    if (response?.success && response.data) {
      const jobData = response.data as JobData;
      const hasJob = !!(jobData.title || jobData.company);

      if (hasJob) {
        // Check if already tracked
        let isDuplicate = false;
        try {
          const duplicateCheck = await api.checkDuplicate(jobData.url);
          isDuplicate = duplicateCheck.exists;
        } catch {
          // Ignore duplicate check errors
        }

        tabStates.set(tabId, { hasJob: true, jobData, isDuplicate });
      } else {
        tabStates.set(tabId, { hasJob: false });
      }
    } else {
      tabStates.set(tabId, { hasJob: false });
    }
  } catch {
    // Content script not ready or page doesn't support it
    tabStates.set(tabId, { hasJob: false });
  }

  await updateTabIcon(tabId);
});

/**
 * Listen for tab activation to update icon
 */
browser.tabs.onActivated.addListener(async (activeInfo) => {
  await updateTabIcon(activeInfo.tabId);
});

/**
 * Clean up when tab is closed
 */
browser.tabs.onRemoved.addListener((tabId) => {
  tabStates.delete(tabId);
});

// ============================================================================
// Offline Queue / Pending Saves
// ============================================================================

/**
 * Add a save to the pending queue
 */
async function addPendingSave(data: ApplicationPayload): Promise<string> {
  const id = `pending_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const pending: PendingSave = {
    id,
    data,
    timestamp: Date.now(),
    retries: 0,
  };

  const existingPending =
    (await storage.get<PendingSave[]>(STORAGE_KEYS.PENDING_SAVES)) ?? [];
  existingPending.push(pending);
  await storage.set(STORAGE_KEYS.PENDING_SAVES, existingPending);

  return id;
}

/**
 * Process all pending saves
 */
async function processPendingSaves(): Promise<void> {
  const pending =
    (await storage.get<PendingSave[]>(STORAGE_KEYS.PENDING_SAVES)) ?? [];

  if (pending.length === 0) return;

  const stillPending: PendingSave[] = [];

  for (const item of pending) {
    try {
      await api.saveApplication(item.data);
      console.warn("[AppTrack] Processed pending save:", item.id);
    } catch (error) {
      // Keep in queue if network error, discard if 4xx
      if (error instanceof ApiClientError && error.status && error.status >= 400 && error.status < 500) {
        console.error("[AppTrack] Discarding invalid pending save:", item.id, error);
      } else if (item.retries < 3) {
        stillPending.push({ ...item, retries: item.retries + 1 });
      } else {
        console.error("[AppTrack] Max retries reached for pending save:", item.id);
      }
    }
  }

  await storage.set(STORAGE_KEYS.PENDING_SAVES, stillPending);
}

// ============================================================================
// Message Handlers
// ============================================================================

/**
 * Message handler for popup and content script communication
 */
browser.runtime.onMessage.addListener(
  (message: { type: string; payload?: unknown }, sender): Promise<unknown> | undefined => {
    switch (message.type) {
      case "GET_AUTH_STATE":
        return handleGetAuthState();
      case "GET_JOB_DATA":
        return handleGetJobData(sender.tab?.id);
      case "SAVE_APPLICATION":
        return handleSaveApplication(message.payload, sender.tab?.id);
      case "CHECK_DUPLICATE":
        return handleCheckDuplicate(message.payload);
      case "SET_AUTH_STATE":
        return handleSetAuthState(message.payload);
      case "LOGOUT":
        return handleLogoutMessage();
      case "REFRESH_TOKEN":
        return handleRefreshToken();
      default:
        return undefined;
    }
  }
);

/**
 * Get current authentication state
 */
async function handleGetAuthState(): Promise<{
  isAuthenticated: boolean;
  userId?: string;
  expiresAt?: number;
}> {
  try {
    const authState = await storage.getAuthState();
    return {
      isAuthenticated: authState.isAuthenticated,
      userId: authState.userId,
      expiresAt: authState.expiresAt,
    };
  } catch (error) {
    console.error("[AppTrack] Error getting auth state:", error);
    return { isAuthenticated: false };
  }
}

/**
 * Set authentication state (called after OAuth flow)
 */
async function handleSetAuthState(
  payload: unknown
): Promise<{ success: boolean; error?: string }> {
  try {
    const authData = payload as {
      token: string;
      refreshToken?: string;
      expiresAt: number;
      userId: string;
    };

    await storage.setAuthState({
      isAuthenticated: true,
      token: authData.token,
      refreshToken: authData.refreshToken,
      expiresAt: authData.expiresAt,
      userId: authData.userId,
    });

    await setupTokenRefreshAlarm();
    await updateIconState(ICON_STATES.AUTHENTICATED);

    return { success: true };
  } catch (error) {
    console.error("[AppTrack] Error setting auth state:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Handle logout message
 */
async function handleLogoutMessage(): Promise<{ success: boolean }> {
  await handleLogout();
  return { success: true };
}

/**
 * Handle manual token refresh request
 */
async function handleRefreshToken(): Promise<{ success: boolean; error?: string }> {
  const success = await refreshAuthToken();
  return { success, error: success ? undefined : "Token refresh failed" };
}

/**
 * Get job data from the active tab's content script
 */
async function handleGetJobData(
  tabId?: number
): Promise<{ success: boolean; data?: JobData; error?: string }> {
  try {
    let targetTabId = tabId;

    if (!targetTabId) {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      targetTabId = tabs[0]?.id;
    }

    if (!targetTabId) {
      return { success: false, error: "No active tab" };
    }

    // Check if we have cached data
    const cachedState = tabStates.get(targetTabId);
    if (cachedState?.jobData) {
      return { success: true, data: cachedState.jobData };
    }

    // Fetch fresh data
    const response = await browser.tabs.sendMessage(targetTabId, {
      type: "EXTRACT_JOB_DATA",
    });

    if (response?.success && response.data) {
      return { success: true, data: response.data as JobData };
    }

    return { success: false, error: "No job data found" };
  } catch (error) {
    console.error("[AppTrack] Error getting job data:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Save a job application
 */
async function handleSaveApplication(
  payload: unknown,
  tabId?: number
): Promise<{ success: boolean; id?: string; error?: string; queued?: boolean }> {
  try {
    const authState = await storage.getAuthState();
    if (!authState.isAuthenticated) {
      return { success: false, error: "Not authenticated" };
    }

    const applicationData = payload as ApplicationPayload;

    if (!applicationData.jobTitle || !applicationData.company || !applicationData.jobUrl) {
      return { success: false, error: "Missing required fields" };
    }

    try {
      const result = await api.saveApplication(applicationData);

      // Update tab state to show as tracked
      if (tabId) {
        const tabState = tabStates.get(tabId);
        if (tabState) {
          tabStates.set(tabId, { ...tabState, isDuplicate: true });
          await updateTabIcon(tabId);
        }
      }

      return { success: true, id: result.id };
    } catch (error) {
      // If network error, queue for later
      if (
        error instanceof ApiClientError &&
        (!error.status || error.code === "TIMEOUT")
      ) {
        const pendingId = await addPendingSave(applicationData);
        return { success: true, id: pendingId, queued: true };
      }

      throw error;
    }
  } catch (error) {
    console.error("[AppTrack] Error saving application:", error);
    return {
      success: false,
      error: error instanceof ApiClientError ? error.message : String(error),
    };
  }
}

/**
 * Check if a job URL is already tracked
 */
async function handleCheckDuplicate(
  payload: unknown
): Promise<{ success: boolean; exists?: boolean; applicationId?: string; error?: string }> {
  try {
    const { url } = payload as { url: string };
    if (!url) {
      return { success: false, error: "URL required" };
    }

    const authState = await storage.getAuthState();
    if (!authState.isAuthenticated) {
      return { success: false, error: "Not authenticated" };
    }

    const result = await api.checkDuplicate(url);
    return { success: true, exists: result.exists, applicationId: result.applicationId };
  } catch (error) {
    console.error("[AppTrack] Error checking duplicate:", error);
    return {
      success: false,
      error: error instanceof ApiClientError ? error.message : String(error),
    };
  }
}

// ============================================================================
// Network Status Listener
// ============================================================================

// Process pending saves when coming back online
if (typeof navigator !== "undefined" && "onLine" in navigator) {
  self.addEventListener("online", () => {
    console.warn("[AppTrack] Back online, processing pending saves");
    processPendingSaves().catch(console.error);
  });
}

export {};
