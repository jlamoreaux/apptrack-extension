/**
 * Auth Callback Handler
 * Processes OAuth callback from apptrack.ing and stores auth tokens
 *
 * Supports two flows:
 * 1. Direct tokens: token, refreshToken, expiresAt, userId in URL params
 * 2. Authorization code: code in URL params (exchanged via API)
 */

import browser from "webextension-polyfill";
import { api } from "@/shared/utils/api";

interface DirectAuthParams {
  type: "direct";
  token: string;
  refreshToken?: string;
  expiresAt: string;
  userId: string;
}

interface CodeAuthParams {
  type: "code";
  code: string;
}

interface ErrorParams {
  type: "error";
  error: string;
}

type AuthParams = DirectAuthParams | CodeAuthParams | ErrorParams | null;

/**
 * Clear sensitive URL parameters from browser history
 * This prevents tokens from being visible in history/URL bar
 */
function clearSensitiveUrlParams(): void {
  try {
    // Replace current history entry with clean URL (no query params)
    window.history.replaceState({}, document.title, window.location.pathname);
  } catch {
    // Ignore errors - some contexts may not allow history manipulation
  }
}

/**
 * Parse URL parameters from the callback
 */
function getAuthParams(): AuthParams {
  const params = new URLSearchParams(window.location.search);

  // Check for error first
  const error = params.get("error");
  if (error) {
    // Clear params even for errors (may contain sensitive state)
    clearSensitiveUrlParams();
    return { type: "error", error };
  }

  // Check for authorization code flow
  const code = params.get("code");
  if (code) {
    // Clear the auth code from URL immediately after reading
    clearSensitiveUrlParams();
    return { type: "code", code };
  }

  // Check for direct token flow
  const token = params.get("token");
  const expiresAt = params.get("expiresAt");
  const userId = params.get("userId");

  if (token && expiresAt && userId) {
    const result: DirectAuthParams = {
      type: "direct",
      token,
      refreshToken: params.get("refreshToken") ?? undefined,
      expiresAt,
      userId,
    };

    // SECURITY: Clear sensitive tokens from URL immediately after reading
    clearSensitiveUrlParams();

    return result;
  }

  return null;
}

/**
 * Show a specific UI state
 */
function showState(state: "loading" | "success" | "error", errorMessage?: string): void {
  const loadingEl = document.getElementById("loading");
  const successEl = document.getElementById("success");
  const errorEl = document.getElementById("error");
  const errorMsgEl = document.getElementById("error-message");

  loadingEl?.classList.add("hidden");
  successEl?.classList.add("hidden");
  errorEl?.classList.add("hidden");

  switch (state) {
    case "loading":
      loadingEl?.classList.remove("hidden");
      break;
    case "success":
      successEl?.classList.remove("hidden");
      break;
    case "error":
      errorEl?.classList.remove("hidden");
      if (errorMsgEl && errorMessage) {
        errorMsgEl.textContent = errorMessage;
      }
      break;
  }
}

/**
 * Main callback handler
 */
async function handleCallback(): Promise<void> {
  showState("loading");

  const authParams = getAuthParams();

  // Check for missing params
  if (!authParams) {
    showState("error", "Invalid callback parameters. Please try signing in again.");
    return;
  }

  // Check for error from server
  if (authParams.type === "error") {
    showState("error", decodeURIComponent(authParams.error));
    return;
  }

  try {
    let token: string;
    let refreshToken: string | undefined;
    let expiresAt: number;
    let userId: string;

    if (authParams.type === "code") {
      // Authorization code flow - exchange code for tokens
      const tokenResponse = await api.exchangeAuthCode(authParams.code);
      token = tokenResponse.token;
      refreshToken = tokenResponse.refreshToken;
      expiresAt = tokenResponse.expiresAt;
      userId = tokenResponse.userId;
    } else {
      // Direct token flow - parse from URL params
      token = authParams.token;
      refreshToken = authParams.refreshToken;
      expiresAt = parseInt(authParams.expiresAt, 10);
      userId = authParams.userId;

      if (isNaN(expiresAt)) {
        throw new Error("Invalid expiry time");
      }
    }

    // Send auth data to background worker
    const response = (await browser.runtime.sendMessage({
      type: "SET_AUTH_STATE",
      payload: {
        token,
        refreshToken,
        expiresAt,
        userId,
      },
    })) as { success?: boolean; error?: string } | undefined;

    if (!response?.success) {
      throw new Error(response?.error ?? "Failed to save authentication");
    }

    // Show success state
    showState("success");

    // Close window after a short delay
    setTimeout(() => {
      window.close();
      // If window.close() fails (e.g., window wasn't opened by script),
      // the user will see the success message with instructions
    }, 2000);
  } catch (error) {
    console.error("[AppTrack] Auth callback error:", error);
    showState(
      "error",
      error instanceof Error ? error.message : "An unexpected error occurred"
    );
  }
}

// Run on page load
document.addEventListener("DOMContentLoaded", handleCallback);
