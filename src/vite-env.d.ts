/// <reference types="vite/client" />
/// <reference types="@crxjs/vite-plugin/client" />

// CRXJS ?script imports: resolved at build time to the content script's
// extension-relative path for use with chrome.scripting.registerContentScripts.
declare module "*?script" {
  const scriptUrl: string;
  export default scriptUrl;
}
