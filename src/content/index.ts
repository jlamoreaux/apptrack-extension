/**
 * Content Script
 * Runs on all pages to extract job posting data
 */

import browser from "webextension-polyfill";
import { extractJobData } from "./extractors";

// Message handler for background script communication
browser.runtime.onMessage.addListener(
  (message: unknown): Promise<unknown> | undefined => {
    const msg = message as { type: string };
    if (!msg || typeof msg.type !== "string") {
      return undefined;
    }

    switch (msg.type) {
      case "EXTRACT_JOB_DATA":
        return Promise.resolve({
          success: true,
          data: extractJobData(),
        });
      default:
        return undefined;
    }
  }
);

export {};
