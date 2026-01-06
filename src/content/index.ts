/**
 * Content Script
 * Runs on all pages to extract job posting data
 */

console.log("[AppTrack] Content script loaded");

// Message handler for background script communication
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[AppTrack] Content script received message:", message);

  switch (message.type) {
    case "EXTRACT_JOB_DATA":
      // TODO: Implement job extraction
      const jobData = extractJobData();
      sendResponse({ success: true, data: jobData });
      break;
    default:
      sendResponse({ success: false, error: "Unknown message type" });
  }

  return true;
});

/**
 * Extract job data from the current page
 * Uses a layered approach: JSON-LD > Meta tags > Heuristics
 */
function extractJobData() {
  // TODO: Implement extraction layers
  return {
    title: null,
    company: null,
    url: window.location.href,
    description: null,
    location: null,
    salary: null,
  };
}

export {};
