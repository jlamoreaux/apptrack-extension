/**
 * Auth Callback Handler
 * Fallback page that processes auth tokens from URL params.
 * Primary auth flow uses chrome.runtime.sendMessage from the web app directly.
 */

import browser from "webextension-polyfill";
import { APP_URL } from "@/shared/constants";

interface DirectAuthParams {
  type: "direct";
  token: string;
  expiresAt: string;
  userId: string;
}

interface ErrorParams {
  type: "error";
  error: string;
}

type AuthParams = DirectAuthParams | ErrorParams | null;

/**
 * Clear sensitive URL parameters from browser history
 */
function clearSensitiveUrlParams(): void {
  try {
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
    clearSensitiveUrlParams();
    return { type: "error", error };
  }

  // Check for direct token flow
  const token = params.get("token");
  const expiresAt = params.get("expiresAt");
  const userId = params.get("userId");

  if (token && expiresAt && userId) {
    const result: DirectAuthParams = {
      type: "direct",
      token,
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

  if (!authParams) {
    showState("error", "Invalid callback parameters. Please try signing in again.");
    return;
  }

  if (authParams.type === "error") {
    showState("error", decodeURIComponent(authParams.error));
    return;
  }

  try {
    // Parse expiresAt — accept both ISO string and numeric timestamp.
    // Background's validateAuthPayload handles full validation (NaN, expiry).
    let expiresAt: number | string;
    const parsed = Number(authParams.expiresAt);
    if (!isNaN(parsed) && parsed > 0) {
      expiresAt = parsed;
    } else {
      expiresAt = authParams.expiresAt;
    }

    // Send auth data to background worker (background validates expiresAt)
    const response: { success?: boolean; error?: string } | undefined = await browser.runtime.sendMessage({
      type: "SET_AUTH_STATE",
      payload: {
        token: authParams.token,
        expiresAt,
        userId: authParams.userId,
      },
    });

    if (!response?.success) {
      throw new Error(response?.error ?? "Failed to save authentication");
    }

    showState("success");

    setTimeout(() => {
      window.close();
    }, 2000);
  } catch (error) {
    console.error("[AppTrack] Auth callback error:", error);
    showState(
      "error",
      error instanceof Error ? error.message : "An unexpected error occurred"
    );
  }
}

/**
 * Update "Try Again" link with extension ID
 */
function updateTryAgainLink(): void {
  const tryAgainLink = document.querySelector('a.btn[href*="extension-callback"]');
  if (tryAgainLink) {
    const extensionId = browser.runtime.id;
    const url = new URL(`${APP_URL}/auth/extension-callback`);
    url.searchParams.set("extensionId", extensionId);
    tryAgainLink.setAttribute("href", url.toString());
  }
}

// Run on page load
document.addEventListener("DOMContentLoaded", () => {
  updateTryAgainLink();
  void handleCallback();
});
