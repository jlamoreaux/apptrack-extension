/**
 * Background Service Worker
 * Handles messaging, auth state, API calls, and icon updates
 */

console.log("[AppTrack] Background service worker initialized");

// Keep service worker alive
chrome.runtime.onInstalled.addListener(() => {
  console.log("[AppTrack] Extension installed");
});

// Message handler for popup and content script communication
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[AppTrack] Message received:", message);

  // Handle async responses
  (async () => {
    try {
      switch (message.type) {
        case "GET_AUTH_STATE":
          // TODO: Implement auth state retrieval
          sendResponse({ isAuthenticated: false });
          break;
        case "GET_JOB_DATA":
          // TODO: Forward to content script
          sendResponse({ success: false, error: "Not implemented" });
          break;
        case "SAVE_APPLICATION":
          // TODO: Implement API call
          sendResponse({ success: false, error: "Not implemented" });
          break;
        default:
          sendResponse({ success: false, error: "Unknown message type" });
      }
    } catch (error) {
      console.error("[AppTrack] Error handling message:", error);
      sendResponse({ success: false, error: String(error) });
    }
  })();

  // Return true to indicate async response
  return true;
});

export {};
