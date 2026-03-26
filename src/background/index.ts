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
  FULL_SITE_SCRIPT_ID,
  FULL_SITE_ORIGIN,
  JOB_FIT_CONFIG,
} from "@/shared/constants";
import type { JobData, ApplicationPayload, JobFitStatus, JobFitResult, JobFitCacheEntry } from "@/shared/types";
// CRXJS resolves this to the correct built path at bundle time.
// Using ?script ensures the path stays correct even if CRXJS adds content hashing.
import contentScriptUrl from "../content/index.ts?script";

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
  jobFitStatus?: JobFitStatus;
  jobFitResult?: JobFitResult;
}

// Track state per tab
const tabStates = new Map<number, TabState>();

// Debounce timers for auto job fit analysis (keyed by tabId)
const jobFitTimers = new Map<number, ReturnType<typeof setTimeout>>();

// ============================================================================
// Auth Data Validation & Storage
// ============================================================================

interface AuthPayload {
  token: string;
  expiresAt: number;
  userId: string;
}

/**
 * Validate auth payload has required fields with correct types.
 * Accepts expiresAt as either a number (timestamp) or ISO string, normalizes to number.
 */
function validateAuthPayload(payload: unknown): { valid: true; data: AuthPayload } | { valid: false; error: string } {
  if (!payload || typeof payload !== "object") {
    return { valid: false, error: "Invalid payload format" };
  }

  const data = payload as Record<string, unknown>;

  if (typeof data.token !== "string" || data.token.length === 0) {
    return { valid: false, error: "Invalid or missing token" };
  }

  // Normalize expiresAt: accept number or ISO string
  let expiresAt: number;
  if (typeof data.expiresAt === "number") {
    expiresAt = data.expiresAt;
  } else if (typeof data.expiresAt === "string") {
    expiresAt = new Date(data.expiresAt).getTime();
  } else {
    return { valid: false, error: "Invalid or missing expiresAt" };
  }

  if (isNaN(expiresAt) || expiresAt <= Date.now()) {
    return { valid: false, error: "Invalid or expired expiresAt timestamp" };
  }

  if (typeof data.userId !== "string" || data.userId.length === 0) {
    return { valid: false, error: "Invalid or missing userId" };
  }

  return {
    valid: true,
    data: {
      token: data.token,
      expiresAt,
      userId: data.userId,
    },
  };
}

/**
 * Store validated auth data and setup refresh
 */
async function storeAuthAndSetup(authData: AuthPayload): Promise<void> {
  await storage.setAuthState({
    isAuthenticated: true,
    token: authData.token,
    expiresAt: authData.expiresAt,
    userId: authData.userId,
  });

  await setupTokenRefreshAlarm();
  await updateIconState(ICON_STATES.AUTHENTICATED);
}

/**
 * Check if sender is from an extension page (popup or callback)
 */
function isExtensionPage(sender: browser.Runtime.MessageSender): boolean {
  const senderUrl = sender.url ?? "";
  const extensionOrigin = `chrome-extension://${browser.runtime.id}`;
  const mozExtensionOrigin = `moz-extension://${browser.runtime.id}`;

  return senderUrl.startsWith(extensionOrigin) || senderUrl.startsWith(mozExtensionOrigin);
}

// ============================================================================
// Initialization
// ============================================================================

// Initialize on install
browser.runtime.onInstalled.addListener((details) => {
  // eslint-disable-next-line no-console
  console.log("[AppTrack] Extension installed:", details.reason);

  // Set default icon state
  void (async () => {
    await updateIconState(ICON_STATES.DEFAULT);
    await setupTokenRefreshAlarm();
  })();
});

// Initialize on startup
browser.runtime.onStartup.addListener(() => {
  // eslint-disable-next-line no-console
  console.log("[AppTrack] Extension started");
  void (async () => {

  // Restore icon state based on auth
  const authState = await storage.getAuthState();
  await updateIconState(
    authState.isAuthenticated ? ICON_STATES.AUTHENTICATED : ICON_STATES.DEFAULT
  );

  // Setup token refresh alarm
  await setupTokenRefreshAlarm();

  // Process any pending saves
  await processPendingSaves();

  // Restore full-site content script if permission is still granted.
  // Dynamic script registrations persist, but we re-verify the permission
  // is still active in case the user revoked it via chrome://extensions.
  const granted = await hasFullSitePermission();
  if (granted) {
    await registerFullSiteContentScript();
  } else {
    // Permission was revoked externally — sync settings
    await storage.setSettings({ fullSiteAccess: false });
  }
  })();
});

// ============================================================================
// Icon Management
// ============================================================================

/**
 * Update the extension icon: greyed out when logged out, full color when authenticated.
 * Uses chrome.action directly instead of the browser polyfill because
 * webextension-polyfill doesn't properly type or polyfill setIcon/setBadgeText.
 */
async function updateIconState(state: IconState, tabId?: number): Promise<void> {
  try {
    const isActive = state !== ICON_STATES.DEFAULT;
    const suffix = isActive ? "" : "-grey";
    const path: Record<string, string> = {
      "16": `icons/icon-16${suffix}.png`,
      "48": `icons/icon-48${suffix}.png`,
      "128": `icons/icon-128${suffix}.png`,
    };

    if (tabId) {
      await chrome.action.setIcon({ path, tabId });
    } else {
      await chrome.action.setIcon({ path });
    }

    // Clear any leftover badge text
    if (tabId) {
      await chrome.action.setBadgeText({ tabId, text: "" });
    } else {
      await chrome.action.setBadgeText({ text: "" });
    }
  } catch (error) {
    console.error("[AppTrack] Error updating icon:", error);
  }
}

/**
 * Update icon for a specific tab based on auth state
 */
async function updateTabIcon(tabId: number): Promise<void> {
  const authState = await storage.getAuthState();

  if (!authState.isAuthenticated) {
    await updateIconState(ICON_STATES.DEFAULT, tabId);
    return;
  }

  // Set the base icon to active (full color)
  await updateIconState(ICON_STATES.AUTHENTICATED, tabId);

  const tabState = tabStates.get(tabId);
  if (!tabState?.hasJob) return;

  // Job fit badge states overlay on top of the active icon
  if (tabState.jobFitStatus === "loading") {
    await chrome.action.setBadgeText({ text: "...", tabId });
    await chrome.action.setBadgeBackgroundColor({ color: "#3B82F6", tabId }); // blue
    return;
  }

  if (tabState.jobFitStatus === "ready" && tabState.jobFitResult) {
    const score = tabState.jobFitResult.overallScore;
    const color =
      score >= 80 ? "#16a34a" : // green
      score >= 60 ? "#ca8a04" : // yellow
      "#6b7280";               // gray
    await chrome.action.setBadgeText({ text: String(score), tabId });
    await chrome.action.setBadgeBackgroundColor({ color, tabId });
    return;
  }

  if (tabState.jobFitStatus === "no_resume") {
    await chrome.action.setBadgeText({ text: "?", tabId });
    await chrome.action.setBadgeBackgroundColor({ color: "#9CA3AF", tabId });
    return;
  }
}

// ============================================================================
// Job Fit Analysis
// ============================================================================

/**
 * Schedule auto job fit analysis for a tab, with 3s debounce.
 */
function scheduleJobFitAnalysis(tabId: number, jobData: JobData): void {
  // Clear any existing timer for this tab
  const existing = jobFitTimers.get(tabId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    jobFitTimers.delete(tabId);
    runJobFitAnalysis(tabId, jobData).catch(console.error);
  }, JOB_FIT_CONFIG.DWELL_DELAY_MS);

  jobFitTimers.set(tabId, timer);
}

async function runJobFitAnalysis(tabId: number, jobData: JobData): Promise<void> {
  const settings = await storage.getSettings();

  // Respect user opt-out
  if (!settings.autoAnalysis) return;

  const url = jobData.url;

  // Check cache first
  const cached = await storage.getJobFitCacheEntry(url);
  if (cached) {
    const status: JobFitStatus = cached.errorCode === "no_resume"
      ? "no_resume"
      : cached.errorCode === "upgrade_required"
      ? "upgrade_required"
      : cached.result
      ? "ready"
      : "error";

    tabStates.set(tabId, { ...tabStates.get(tabId)!, jobFitStatus: status, jobFitResult: cached.result });
    await updateTabIcon(tabId);
    return;
  }

  // Set loading state
  tabStates.set(tabId, { ...tabStates.get(tabId)!, jobFitStatus: "loading" });
  await updateTabIcon(tabId);

  try {
    const result = await api.jobFit({
      jobDescription: jobData.description ?? "",
      jobTitle: jobData.title ?? undefined,
      company: jobData.company ?? undefined,
    });

    const cacheEntry: JobFitCacheEntry = { result, cachedAt: Date.now() };
    await storage.setJobFitCacheEntry(url, cacheEntry);

    tabStates.set(tabId, { ...tabStates.get(tabId)!, jobFitStatus: "ready", jobFitResult: result });
    await updateTabIcon(tabId);

  } catch (error) {
    let status: JobFitStatus = "error";
    let errorCode: JobFitCacheEntry["errorCode"] = "error";

    if (error instanceof ApiClientError) {
      if (error.status === 403) {
        status = "upgrade_required";
        errorCode = "upgrade_required";
      } else if (error.status === 400) {
        status = "no_resume";
        errorCode = "no_resume";
      }
    }

    // Cache the error state too (avoids re-firing on every page reload)
    await storage.setJobFitCacheEntry(url, { errorCode, cachedAt: Date.now() });

    tabStates.set(tabId, { ...tabStates.get(tabId)!, jobFitStatus: status, jobFitResult: undefined });
    await updateTabIcon(tabId);
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
browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TOKEN_CONFIG.REFRESH_ALARM_NAME) {
    void refreshAuthToken();
  }
});

/**
 * Refresh the authentication token.
 * Uses Authorization header (sent automatically by api.request) — no refresh token needed.
 */
async function refreshAuthToken(): Promise<boolean> {
  try {
    const authState = await storage.getAuthState();

    if (!authState.token) {
      // eslint-disable-next-line no-console
      console.log("[AppTrack] No token available for refresh");
      await handleLogout();
      return false;
    }

    const result = await api.refreshToken();

    // Backend returns expiresAt as ISO string — convert to timestamp
    const expiresAt = typeof result.expiresAt === "string"
      ? new Date(result.expiresAt).getTime()
      : result.expiresAt;

    if (isNaN(expiresAt) || expiresAt <= Date.now()) {
      console.error("[AppTrack] Token refresh returned invalid expiresAt:", result.expiresAt);
      await handleLogout();
      return false;
    }

    await storage.setAuthState({
      ...authState,
      token: result.token,
      expiresAt,
    });

    // Setup next refresh alarm
    await setupTokenRefreshAlarm();

    // eslint-disable-next-line no-console
    console.log("[AppTrack] Token refreshed successfully");
    return true;
  } catch (error) {
    console.error("[AppTrack] Token refresh failed:", error);

    if (error instanceof ApiClientError && error.status === 401) {
      // Token is invalid, logout
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
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  void (async () => {
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
    const response: { success?: boolean; data?: JobData } | undefined = await browser.tabs.sendMessage(tabId, {
      type: "EXTRACT_JOB_DATA",
    });

    if (response?.success && response.data) {
      const jobData = response.data;
      const hasJob = !!(jobData.title || jobData.company);

      if (hasJob) {
        // Check if already tracked using company + role (only if both are present)
        let isDuplicate = false;
        if (jobData.company && jobData.title) {
          try {
            const duplicateCheck = await api.checkDuplicate(
              jobData.company,
              jobData.title
            );
            isDuplicate = duplicateCheck.exists;
          } catch {
            // Ignore duplicate check errors
          }
        }

        tabStates.set(tabId, { hasJob: true, jobData, isDuplicate });
        await updateTabIcon(tabId);
        scheduleJobFitAnalysis(tabId, jobData);
        return;
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
  })();
});

/**
 * Listen for tab activation to update icon
 */
browser.tabs.onActivated.addListener((activeInfo) => {
  void updateTabIcon(activeInfo.tabId);
});

/**
 * Clean up when tab is closed
 */
browser.tabs.onRemoved.addListener((tabId) => {
  tabStates.delete(tabId);
  // Clear any pending job fit timer
  const timer = jobFitTimers.get(tabId);
  if (timer) {
    clearTimeout(timer);
    jobFitTimers.delete(tabId);
  }
});

// ============================================================================
// Full-Site Access (Optional Permission)
// ============================================================================

/**
 * Check whether the full-site optional permission is currently granted.
 */
async function hasFullSitePermission(): Promise<boolean> {
  try {
    return await browser.permissions.contains({ origins: [FULL_SITE_ORIGIN] });
  } catch {
    return false;
  }
}

/**
 * Register the dynamic content script for full-site access.
 * Called after the optional permission is granted.
 */
async function registerFullSiteContentScript(): Promise<void> {
  try {
    // Unregister first to avoid duplicate registration errors
    await chrome.scripting.unregisterContentScripts({ ids: [FULL_SITE_SCRIPT_ID] }).catch(() => {});
    await chrome.scripting.registerContentScripts([
      {
        id: FULL_SITE_SCRIPT_ID,
        matches: ["<all_urls>"],
        // contentScriptUrl is resolved by CRXJS at build time — avoids hardcoding
        // a path that may be hashed or relocated in the extension bundle.
        js: [contentScriptUrl],
        runAt: "document_idle",
        persistAcrossSessions: true,
      },
    ]);
  } catch (error) {
    console.error("[AppTrack] Failed to register full-site content script:", error);
  }
}

/**
 * Unregister the dynamic full-site content script.
 */
async function unregisterFullSiteContentScript(): Promise<void> {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [FULL_SITE_SCRIPT_ID] });
  } catch {
    // Script may not be registered — ignore
  }
}

/**
 * Enable full-site access: request permission and register content script.
 * Returns true if permission was granted.
 *
 * Note: browser.permissions.request requires a user gesture. This function
 * must only be called in response to a user action (e.g., popup button click
 * → message to background). Calling it programmatically on startup will fail.
 */
async function enableFullSiteAccess(): Promise<boolean> {
  try {
    const granted = await browser.permissions.request({ origins: [FULL_SITE_ORIGIN] });
    if (granted) {
      await registerFullSiteContentScript();
      await storage.setSettings({ fullSiteAccess: true });
    }
    return granted;
  } catch (error) {
    console.error("[AppTrack] Error enabling full-site access:", error);
    return false;
  }
}

/**
 * Disable full-site access: remove permission and unregister content script.
 */
async function disableFullSiteAccess(): Promise<void> {
  try {
    await unregisterFullSiteContentScript();
    await browser.permissions.remove({ origins: [FULL_SITE_ORIGIN] });
    await storage.setSettings({ fullSiteAccess: false });
  } catch (error) {
    console.error("[AppTrack] Error disabling full-site access:", error);
  }
}

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
      // eslint-disable-next-line no-console
      console.log("[AppTrack] Processed pending save:", item.id);
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
  (
    message: unknown,
    sender: browser.Runtime.MessageSender
  ): Promise<unknown> | undefined => {
    const msg = message as { type: string; payload?: unknown };
    if (!msg || typeof msg.type !== "string") {
      return undefined;
    }

    switch (msg.type) {
      case "GET_AUTH_STATE":
        return handleGetAuthState();
      case "GET_JOB_DATA":
        return handleGetJobData(sender.tab?.id);
      case "SAVE_APPLICATION":
        return handleSaveApplication(msg.payload, sender.tab?.id);
      case "CHECK_DUPLICATE":
        return handleCheckDuplicate(msg.payload);
      case "SET_AUTH_STATE":
        // SECURITY: Only allow SET_AUTH_STATE from extension pages (popup/callback).
        // This prevents malicious content scripts from injecting arbitrary tokens.
        if (!isExtensionPage(sender)) {
          console.error("[AppTrack] Rejected SET_AUTH_STATE from non-extension page:", sender.url);
          return Promise.resolve({ success: false, error: "Unauthorized" });
        }
        return handleSetAuthState(msg.payload);
      case "LOGOUT":
        return handleLogoutMessage();
      case "REFRESH_TOKEN":
        return handleRefreshToken();
      case "ENABLE_FULL_SITE_ACCESS":
        return enableFullSiteAccess().then((granted) => ({ success: granted }));
      case "DISABLE_FULL_SITE_ACCESS":
        return disableFullSiteAccess().then(() => ({ success: true }));
      case "GET_FULL_SITE_STATUS":
        return hasFullSitePermission().then((enabled) => ({ success: true, data: { enabled } }));
      case "GET_JOB_FIT":
        return handleGetJobFit(sender.tab?.id);
      case "CLEAR_JOB_FIT_CACHE":
        return storage.clearJobFitCache().then(() => ({ success: true }));
      default:
        return undefined;
    }
  }
);

/**
 * Get current authentication state
 */
async function handleGetAuthState(): Promise<{
  success: boolean;
  data: { isAuthenticated: boolean; userId?: string; expiresAt?: number };
}> {
  try {
    const authState = await storage.getAuthState();
    return {
      success: true,
      data: {
        isAuthenticated: authState.isAuthenticated,
        userId: authState.userId,
        expiresAt: authState.expiresAt,
      },
    };
  } catch (error) {
    console.error("[AppTrack] Error getting auth state:", error);
    return { success: true, data: { isAuthenticated: false } };
  }
}

/**
 * Set authentication state (called after OAuth flow)
 */
async function handleSetAuthState(
  payload: unknown
): Promise<{ success: boolean; error?: string }> {
  try {
    const validation = validateAuthPayload(payload);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    await storeAuthAndSetup(validation.data);
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
    const response: { success?: boolean; data?: JobData } | undefined = await browser.tabs.sendMessage(targetTabId, {
      type: "EXTRACT_JOB_DATA",
    });

    if (response?.success && response.data) {
      return { success: true, data: response.data };
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
): Promise<{ success: boolean; data?: { id: string; queued?: boolean }; error?: string }> {
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

      return { success: true, data: { id: result.id } };
    } catch (error) {
      // If network error, queue for later
      if (
        error instanceof ApiClientError &&
        (!error.status || error.code === "TIMEOUT")
      ) {
        const pendingId = await addPendingSave(applicationData);
        return { success: true, data: { id: pendingId, queued: true } };
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
 * Check if a job is already tracked by company and role
 */
async function handleCheckDuplicate(
  payload: unknown
): Promise<{ success: boolean; data?: { exists: boolean; applicationId?: string }; error?: string }> {
  try {
    const { company, role } = payload as { company: string; role: string };
    if (!company || !role) {
      return { success: false, error: "Company and role required" };
    }

    const authState = await storage.getAuthState();
    if (!authState.isAuthenticated) {
      return { success: false, error: "Not authenticated" };
    }

    const result = await api.checkDuplicate(company, role);
    return { success: true, data: { exists: result.exists, applicationId: result.applicationId } };
  } catch (error) {
    console.error("[AppTrack] Error checking duplicate:", error);
    return {
      success: false,
      error: error instanceof ApiClientError ? error.message : String(error),
    };
  }
}

/**
 * Get job fit state for the active (or sender) tab
 */
async function handleGetJobFit(
  tabId?: number
): Promise<{ success: boolean; data?: { status: JobFitStatus; result?: JobFitResult }; error?: string }> {
  try {
    let targetTabId = tabId;
    if (!targetTabId) {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      targetTabId = tabs[0]?.id;
    }
    if (!targetTabId) {
      return { success: false, error: "No active tab" };
    }
    const tabState = tabStates.get(targetTabId);
    return {
      success: true,
      data: {
        status: tabState?.jobFitStatus ?? "idle",
        result: tabState?.jobFitResult,
      },
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ============================================================================
// Network Status Listener
// ============================================================================

// Process pending saves when coming back online
if (typeof navigator !== "undefined" && "onLine" in navigator) {
  self.addEventListener("online", () => {
    // eslint-disable-next-line no-console
    console.log("[AppTrack] Back online, processing pending saves");
    processPendingSaves().catch(console.error);
  });
}

// ============================================================================
// External Message Handler (from apptrack.ing web app)
// ============================================================================

/**
 * Handle messages from apptrack.ing for OAuth authentication.
 * The web app calls chrome.runtime.sendMessage(extensionId, { type: 'AUTH_CALLBACK', payload })
 * with { token, expiresAt: ISO string, user: { id, email, name } }
 */
browser.runtime.onMessageExternal.addListener(
  (
    message: unknown,
    sender: browser.Runtime.MessageSender
  ): Promise<{ success: boolean; error?: string }> | undefined => {
    const msg = message as { type: string; payload?: unknown };

    // Verify sender is from apptrack.ing
    const senderUrl = sender.url ?? "";
    const isValidSender =
      senderUrl.startsWith("https://apptrack.ing/") ||
      senderUrl.startsWith("https://www.apptrack.ing/");

    if (!isValidSender) {
      console.warn("[AppTrack] Rejected external message from:", senderUrl);
      return Promise.resolve({ success: false, error: "Unauthorized sender" });
    }

    if (!msg || typeof msg.type !== "string") {
      return Promise.resolve({ success: false, error: "Invalid message format" });
    }

    switch (msg.type) {
      case "AUTH_CALLBACK":
        return handleAuthCallback(msg.payload);
      case "PING":
        // Allow web app to check if extension is installed
        return Promise.resolve({ success: true });
      default:
        return Promise.resolve({ success: false, error: "Unknown message type" });
    }
  }
);

/**
 * Handle OAuth callback from apptrack.ing.
 * The web app's extension-callback page flattens the token response before sending:
 * { token, expiresAt: ISO string, userId, email }
 */
async function handleAuthCallback(
  payload: unknown
): Promise<{ success: boolean; error?: string }> {
  try {
    const validation = validateAuthPayload(payload);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    await storeAuthAndSetup(validation.data);
    return { success: true };
  } catch (error) {
    console.error("[AppTrack] Auth callback error:", error);
    return { success: false, error: String(error) };
  }
}

export {};
