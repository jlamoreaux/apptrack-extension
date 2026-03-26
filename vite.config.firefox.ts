import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

/**
 * Vite plugin that handles CRXJS-specific `?script` imports.
 * In CRXJS builds, `import url from "./foo.ts?script"` resolves to a hashed
 * asset URL. For the Firefox build we don't use CRXJS, so we resolve these
 * imports to a module that exports the known output path as a string.
 */
function crxScriptShim(): Plugin {
  return {
    name: "crx-script-shim",
    enforce: "pre",
    resolveId(source) {
      if (source.endsWith("?script")) {
        return { id: "\0crx-script-shim:content", moduleSideEffects: false };
      }
      return null;
    },
    load(id) {
      if (id === "\0crx-script-shim:content") {
        return 'const url = "content/index.js"; export default url;';
      }
      return null;
    },
  };
}

/**
 * Firefox build configuration.
 * Builds the extension without the CRXJS plugin (which is Chrome-specific).
 * Outputs a standard web extension bundle to dist-firefox/.
 */
export default defineConfig({
  plugins: [react(), crxScriptShim()],
  base: "./",
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  build: {
    outDir: "dist-firefox",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "src/popup/index.html"),
        background: resolve(__dirname, "src/background/index.ts"),
        content: resolve(__dirname, "src/content/index.ts"),
      },
      output: {
        entryFileNames: "[name]/index.js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
