/**
 * Content Script
 * Runs on all pages to extract job posting data and show contextual prompts
 */

import browser from "webextension-polyfill";
import { extractJobData } from "./extractors";
import { STORAGE_KEYS, APP_URL } from "@/shared/constants";
import type { JobData } from "@/shared/types";

// ============================================================================
// Page classification
// ============================================================================

/** URL patterns that indicate a job-related page */
const JOB_PAGE_PATTERNS = [
  /boards\.greenhouse\.io/,
  /job-boards\.greenhouse\.io/,
  /jobs\.lever\.co/,
  /linkedin\.com\/jobs/,
  /indeed\.com\/(viewjob|jobs)/,
  /glassdoor\.com\/job-listing/,
  /ziprecruiter\.com\/jobs/,
  /myworkdayjobs\.com/,
  /ashbyhq\.com/,
  /careers\./,
  /\/careers\//,
  /\/jobs\//,
];

function isJobRelatedPage(): boolean {
  return JOB_PAGE_PATTERNS.some((p) => p.test(window.location.href));
}

/**
 * Check if the page has an "Apply" button or link — the strongest signal
 * that this is a single job posting rather than a listing page.
 */
function hasApplyButton(): boolean {
  const applyPattern = /\bapply\b/i;
  const excludePattern = /\bapply\s+(filter|sort|search|setting)/i;

  function isJobApply(text: string): boolean {
    return applyPattern.test(text) && !excludePattern.test(text);
  }

  // Check buttons and common CTA link classes
  const elements = document.querySelectorAll(
    "button, a.btn, a[class*='apply'], a[class*='cta'], a[role='button']"
  );
  for (const el of elements) {
    const text = el.textContent?.trim() ?? "";
    if (text.length < 50 && isJobApply(text)) return true;
  }

  // Check plain links with short "apply" text
  const links = document.querySelectorAll("a");
  for (const link of links) {
    const text = link.textContent?.trim() ?? "";
    if (text.length < 30 && isJobApply(text)) return true;
  }

  return false;
}

// ============================================================================
// DOM helpers
// ============================================================================

const BANNER_ID = "apptrack-banner";

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: (HTMLElement | string)[] = []
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    element.setAttribute(key, value);
  }
  for (const child of children) {
    if (typeof child === "string") {
      element.appendChild(document.createTextNode(child));
    } else {
      element.appendChild(child);
    }
  }
  return element;
}

function injectStyles(): void {
  if (document.getElementById("apptrack-styles")) return;
  const style = document.createElement("style");
  style.id = "apptrack-styles";
  style.textContent = `
    #${BANNER_ID} {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      animation: apptrack-slide-in 0.3s ease-out;
    }
    .apptrack-inner {
      display: flex;
      align-items: center;
      gap: 12px;
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 12px 16px;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
      max-width: 520px;
    }
    .apptrack-btn-primary {
      background: #6366f1; color: white; border: none; border-radius: 6px;
      padding: 6px 16px; font-size: 13px; font-weight: 500; cursor: pointer;
      white-space: nowrap;
    }
    .apptrack-btn-primary:hover { background: #4f46e5; }
    .apptrack-btn-secondary {
      background: none; border: 1px solid #d1d5db; border-radius: 6px;
      padding: 6px 12px; font-size: 13px; cursor: pointer; color: #374151;
      white-space: nowrap;
    }
    .apptrack-btn-secondary:hover { background: #f9fafb; }
    .apptrack-btn-close {
      background: none; border: none; cursor: pointer; padding: 4px;
      color: #9ca3af; font-size: 18px; line-height: 1;
    }
    .apptrack-btn-close:hover { color: #374151; }
    @keyframes apptrack-slide-in {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes apptrack-slide-out {
      from { opacity: 1; transform: translateY(0); }
      to { opacity: 0; transform: translateY(12px); }
    }
  `;
  document.head.appendChild(style);
}

function removeBanner(): void {
  const banner = document.getElementById(BANNER_ID);
  if (banner) {
    banner.style.animation = "apptrack-slide-out 0.2s ease-in forwards";
    setTimeout(() => banner.remove(), 200);
  }
}

function makeIcon(): HTMLImageElement {
  return el("img", {
    src: browser.runtime.getURL("icons/icon-48.png"),
    alt: "AppTrack",
    width: "24",
    height: "24",
    style: "border-radius: 4px; flex-shrink: 0;",
  });
}

function makeCloseBtn(): HTMLButtonElement {
  const btn = el("button", { class: "apptrack-btn-close", title: "Dismiss" }, ["\u00d7"]);
  btn.addEventListener("click", () => removeBanner());
  return btn;
}

// ============================================================================
// Sign-in banner (unauthenticated users on job pages)
// ============================================================================

function showSignInBanner(): void {
  injectStyles();

  const textSpan = el("span", { style: "flex: 1; font-size: 14px; color: #1f2937;" }, [
    el("strong", {}, ["AppTrack"]),
    " \u2014 Save this job with one click. ",
    el("span", { style: "color: #6b7280;" }, ["Sign in to track your applications."]),
  ]);

  const signInBtn = el("button", { class: "apptrack-btn-primary" }, ["Sign in"]);
  signInBtn.addEventListener("click", () => {
    const extensionId = browser.runtime.id;
    window.open(`${APP_URL}/auth/extension-callback?extensionId=${extensionId}`, "_blank");
    removeBanner();
  });

  const dismissBtn = el("button", { class: "apptrack-btn-close", title: "Dismiss" }, ["\u00d7"]);
  dismissBtn.addEventListener("click", () => showDismissOptions());

  const inner = el("div", { class: "apptrack-inner" }, [
    makeIcon(),
    textSpan,
    signInBtn,
    dismissBtn,
  ]);
  document.body.appendChild(el("div", { id: BANNER_ID }, [inner]));
}

function showDismissOptions(): void {
  const banner = document.getElementById(BANNER_ID);
  if (!banner) return;
  while (banner.firstChild) banner.removeChild(banner.firstChild);

  const onceBtn = el("button", { class: "apptrack-btn-secondary" }, ["Just this time"]);
  onceBtn.addEventListener("click", () => removeBanner());

  const foreverBtn = el("button", { class: "apptrack-btn-secondary" }, ["Don't show again"]);
  foreverBtn.addEventListener("click", () => {
    void browser.storage.local.set({ [STORAGE_KEYS.BANNER_DISMISSED]: true });
    removeBanner();
  });

  const inner = el("div", { class: "apptrack-inner" }, [
    el("span", { style: "font-size: 14px; color: #1f2937; flex: 1;" }, ["Dismiss this prompt?"]),
    onceBtn,
    foreverBtn,
  ]);
  banner.appendChild(inner);
}

// ============================================================================
// Job-detected toast (authenticated users)
// ============================================================================

function showJobDetectedToast(jobData: JobData): void {
  injectStyles();

  const textSpan = el(
    "span",
    { style: "flex: 1; font-size: 14px; color: #1f2937; min-width: 0;" },
    [
      el(
        "strong",
        {
          style: "display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;",
        },
        [jobData.title ?? "Untitled Position"]
      ),
      el("span", { style: "color: #6b7280; font-size: 13px;" }, [
        jobData.company ?? "Unknown Company",
      ]),
    ]
  );

  const saveBtn = el("button", { class: "apptrack-btn-primary" }, ["Save"]);
  saveBtn.addEventListener("click", () => {
    void (async () => {
      saveBtn.textContent = "Saving...";
      saveBtn.setAttribute("disabled", "true");
      saveBtn.style.opacity = "0.7";
      try {
        const response: { success?: boolean } = await browser.runtime.sendMessage({
          type: "SAVE_APPLICATION",
          payload: {
            jobTitle: jobData.title,
            company: jobData.company,
            jobUrl: jobData.url,
            description: jobData.description ?? undefined,
            location: jobData.location ?? undefined,
            salary: jobData.salary ?? undefined,
          },
        });

        if (response?.success) {
          showSavedConfirmation();
        } else {
          showSaveError(saveBtn);
        }
      } catch {
        showSaveError(saveBtn);
      }
    })();
  });

  const inner = el("div", { class: "apptrack-inner" }, [
    makeIcon(),
    textSpan,
    saveBtn,
    makeCloseBtn(),
  ]);
  document.body.appendChild(el("div", { id: BANNER_ID }, [inner]));
}

function showSaveError(saveBtn: HTMLButtonElement): void {
  saveBtn.textContent = "Failed \u2014 Retry";
  saveBtn.style.background = "#ef4444";
  saveBtn.removeAttribute("disabled");
  saveBtn.style.opacity = "1";
  setTimeout(() => {
    saveBtn.textContent = "Save";
    saveBtn.style.background = "";
  }, 2000);
}

function showSavedConfirmation(): void {
  const banner = document.getElementById(BANNER_ID);
  if (!banner) return;
  while (banner.firstChild) banner.removeChild(banner.firstChild);

  const inner = el("div", { class: "apptrack-inner" }, [
    el("span", { style: "font-size: 20px; flex-shrink: 0;" }, ["\u2705"]),
    el("span", { style: "flex: 1; font-size: 14px; color: #1f2937;" }, [
      el("strong", {}, ["Saved!"]),
      " Added to your job tracker.",
    ]),
    el("button", { class: "apptrack-btn-secondary" }, ["View Dashboard"]),
    makeCloseBtn(),
  ]);

  // Wire up dashboard button
  const dashBtn = inner.querySelector(".apptrack-btn-secondary") as HTMLButtonElement;
  dashBtn.addEventListener("click", () => {
    window.open(`${APP_URL}/dashboard`, "_blank");
    removeBanner();
  });

  banner.appendChild(inner);
  setTimeout(() => removeBanner(), 5000);
}

// ============================================================================
// Initialization
// ============================================================================

async function initialize(): Promise<void> {
  if (!isJobRelatedPage()) return;
  if (document.getElementById(BANNER_ID)) return;

  // Check auth state
  let isAuthenticated = false;
  try {
    const response: { success?: boolean; data?: { isAuthenticated: boolean } } =
      await browser.runtime.sendMessage({
        type: "GET_AUTH_STATE",
      });
    isAuthenticated = response?.success === true && response.data?.isAuthenticated === true;
  } catch {
    return;
  }

  if (!isAuthenticated) {
    const result = await browser.storage.local.get(STORAGE_KEYS.BANNER_DISMISSED);
    if (!result[STORAGE_KEYS.BANNER_DISMISSED]) {
      showSignInBanner();
    }
    return;
  }

  // Authenticated — extract job data
  const jobData = extractJobData();
  if (!jobData.title || !jobData.company) return;

  // Only show toast on pages with an Apply button (single job posting, not a listing)
  if (!hasApplyButton()) return;

  // Skip if already tracked
  try {
    const dupResponse: { success?: boolean; data?: { exists: boolean } } =
      await browser.runtime.sendMessage({
        type: "CHECK_DUPLICATE",
        payload: { company: jobData.company, role: jobData.title },
      });
    if (dupResponse?.success && dupResponse.data?.exists) return;
  } catch {
    // Continue even if duplicate check fails
  }

  showJobDetectedToast(jobData);
}

// ============================================================================
// Message handler
// ============================================================================

browser.runtime.onMessage.addListener((message: unknown): Promise<unknown> | undefined => {
  const msg = message as { type: string };
  if (!msg || typeof msg.type !== "string") return undefined;

  if (msg.type === "EXTRACT_JOB_DATA") {
    return Promise.resolve({ success: true, data: extractJobData() });
  }
  return undefined;
});

void initialize();

export {};
