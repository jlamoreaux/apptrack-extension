import { defineManifest } from "@crxjs/vite-plugin";
import { JOB_BOARD_MATCHES } from "./shared/constants";

export default defineManifest((env) => {
  const isDev = env.mode === "development";

  return {
    manifest_version: 3,
    name: "AppTrack - Job Application Tracker",
    description: "Save job applications with one click. Auto-extract job details and sync to your AppTrack dashboard.",
    version: "0.1.0",
    icons: {
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png",
    },
    action: {
      default_popup: "src/popup/index.html",
      default_icon: {
        "16": "icons/icon-16.png",
        "48": "icons/icon-48.png",
        "128": "icons/icon-128.png",
      },
      default_title: "AppTrack",
    },
    background: {
      service_worker: "src/background/index.ts",
      type: "module" as const,
    },
    content_scripts: [
      {
        // Default: curated list of job boards and ATS platforms covering the
        // majority of job applications. Users can opt into full-site access
        // via extension settings, which dynamically registers a content script
        // for <all_urls> using the optional_host_permissions grant.
        matches: [...JOB_BOARD_MATCHES],
        js: ["src/content/index.ts"],
        run_at: "document_idle" as const,
      },
    ],
    permissions: ["storage", "activeTab", "alarms", "scripting"],
    optional_host_permissions: ["<all_urls>"],
    host_permissions: ["https://apptrack.ing/*", "https://*.apptrack.ing/*"],
    // Allow apptrack.ing to send messages directly to the extension for auth
    externally_connectable: {
      matches: [
        "https://apptrack.ing/*",
        "https://*.apptrack.ing/*",
        // localhost is only included in dev builds to support local development
        ...(isDev ? ["http://localhost/*", "http://127.0.0.1/*"] : []),
      ],
    },
    web_accessible_resources: [
      {
        // Icons can be accessed from any page (for display purposes)
        resources: ["icons/*"],
        matches: ["<all_urls>"],
      },
      {
        // Auth callback page should only be accessible from apptrack.ing.
        // This prevents arbitrary websites from opening/iframing the callback.
        resources: ["src/auth/callback.html"],
        matches: ["https://apptrack.ing/*", "https://*.apptrack.ing/*"],
      },
    ],
  };
});
