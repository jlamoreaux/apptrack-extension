import { defineManifest } from "@crxjs/vite-plugin";

// Note: Replace SVG icons with PNG for production
export default defineManifest({
  manifest_version: 3,
  name: "AppTrack - Job Application Tracker",
  description: "Save job applications with one click. Auto-extract job details and sync to your AppTrack dashboard.",
  version: "0.1.0",
  icons: {
    "16": "icons/icon-16.svg",
    "48": "icons/icon-48.svg",
    "128": "icons/icon-128.svg",
  },
  action: {
    default_popup: "src/popup/index.html",
    default_icon: {
      "16": "icons/icon-16.svg",
      "48": "icons/icon-48.svg",
      "128": "icons/icon-128.svg",
    },
    default_title: "AppTrack",
  },
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  content_scripts: [
    {
      matches: ["<all_urls>"],
      js: ["src/content/index.ts"],
      run_at: "document_idle",
    },
  ],
  permissions: ["storage", "activeTab", "alarms"],
  host_permissions: ["https://apptrack.ing/*", "https://*.apptrack.ing/*"],
  web_accessible_resources: [
    {
      resources: ["icons/*"],
      matches: ["<all_urls>"],
    },
  ],
});
