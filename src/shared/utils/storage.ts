/**
 * Typed wrapper around chrome.storage.local with encryption for sensitive data
 */

import browser from "webextension-polyfill";
import type { AuthState, ExtensionSettings, JobFitCacheEntry } from "@/shared/types";
import { STORAGE_KEYS, DEFAULT_SETTINGS, JOB_FIT_CONFIG } from "@/shared/constants";

type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

/**
 * Simple encryption for sensitive data using Web Crypto API
 * Note: This provides obfuscation, not true security (key is derived from extension ID)
 */
const ENCRYPTION_PREFIX = "enc:";

async function getEncryptionKey(): Promise<CryptoKey> {
  // Use extension ID as basis for key (available to this extension only)
  const extensionId = browser.runtime.id ?? "apptrack-extension";
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(extensionId.padEnd(32, "0").slice(0, 32)),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"]
  );
  return keyMaterial;
}

async function encrypt(data: string): Promise<string> {
  try {
    const key = await getEncryptionKey();
    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encoder.encode(data)
    );
    // Combine IV and encrypted data
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);
    return ENCRYPTION_PREFIX + btoa(String.fromCharCode(...combined));
  } catch (error) {
    console.error("[AppTrack] Encryption failed:", error);
    // Fall back to unencrypted if crypto fails
    return data;
  }
}

async function decrypt(data: string): Promise<string> {
  if (!data.startsWith(ENCRYPTION_PREFIX)) {
    return data; // Not encrypted
  }

  try {
    const key = await getEncryptionKey();
    const combined = Uint8Array.from(atob(data.slice(ENCRYPTION_PREFIX.length)), (c) =>
      c.charCodeAt(0)
    );
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted);
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error("[AppTrack] Decryption failed:", error);
    return ""; // Return empty on decryption failure
  }
}

/**
 * Get a value from storage
 */
export async function get<T>(key: StorageKey): Promise<T | null> {
  try {
    const result = await browser.storage.local.get(key);
    return (result[key] as T) ?? null;
  } catch (error) {
    console.error("[AppTrack] Storage get error:", error);
    return null;
  }
}

/**
 * Set a value in storage
 */
export async function set<T>(key: StorageKey, value: T): Promise<void> {
  try {
    await browser.storage.local.set({ [key]: value });
  } catch (error) {
    console.error("[AppTrack] Storage set error:", error);
  }
}

/**
 * Remove a value from storage
 */
export async function remove(key: StorageKey): Promise<void> {
  try {
    await browser.storage.local.remove(key);
  } catch (error) {
    console.error("[AppTrack] Storage remove error:", error);
  }
}

/**
 * Clear all extension storage
 */
export async function clear(): Promise<void> {
  try {
    await browser.storage.local.clear();
  } catch (error) {
    console.error("[AppTrack] Storage clear error:", error);
  }
}

/**
 * Get the current auth state (with decryption of auth token)
 */
export async function getAuthState(): Promise<AuthState> {
  const state = await get<AuthState & { encryptedToken?: string }>(STORAGE_KEYS.AUTH_STATE);

  if (!state) {
    return { isAuthenticated: false };
  }

  // Decrypt token if it exists
  let token = state.token;

  if (state.encryptedToken) {
    token = await decrypt(state.encryptedToken);
  }

  return {
    isAuthenticated: state.isAuthenticated,
    token,
    expiresAt: state.expiresAt,
    userId: state.userId,
  };
}

/**
 * Set the auth state (with encryption of auth token)
 */
export async function setAuthState(state: AuthState): Promise<void> {
  // Encrypt sensitive token before storage
  const encryptedState: Record<string, unknown> = {
    isAuthenticated: state.isAuthenticated,
    expiresAt: state.expiresAt,
    userId: state.userId,
  };

  if (state.token) {
    encryptedState.encryptedToken = await encrypt(state.token);
  }

  await set(STORAGE_KEYS.AUTH_STATE, encryptedState);
}

/**
 * Clear the auth state (logout)
 */
export async function clearAuthState(): Promise<void> {
  await remove(STORAGE_KEYS.AUTH_STATE);
}

/**
 * Get extension settings, merging with defaults for any missing keys
 */
export async function getSettings(): Promise<ExtensionSettings> {
  const stored = await get<Partial<ExtensionSettings>>(STORAGE_KEYS.SETTINGS);
  return { ...DEFAULT_SETTINGS, ...stored };
}

/**
 * Update extension settings (merges with existing)
 */
export async function setSettings(updates: Partial<ExtensionSettings>): Promise<void> {
  const current = await getSettings();
  await set(STORAGE_KEYS.SETTINGS, { ...current, ...updates });
}

/**
 * Get job fit cache entry for a URL
 */
async function getJobFitCacheEntry(url: string): Promise<JobFitCacheEntry | null> {
  try {
    const cache = await get<Record<string, JobFitCacheEntry>>(STORAGE_KEYS.JOB_FIT_CACHE);
    if (!cache || !cache[url]) return null;

    const entry = cache[url];
    // Check TTL
    if (Date.now() - entry.cachedAt > JOB_FIT_CONFIG.CACHE_TTL) {
      return null; // Expired
    }
    return entry;
  } catch {
    return null;
  }
}

/**
 * Set job fit cache entry for a URL
 */
async function setJobFitCacheEntry(url: string, entry: JobFitCacheEntry): Promise<void> {
  try {
    const cache = (await get<Record<string, JobFitCacheEntry>>(STORAGE_KEYS.JOB_FIT_CACHE)) ?? {};
    cache[url] = entry;
    await set(STORAGE_KEYS.JOB_FIT_CACHE, cache);
  } catch (error) {
    console.error("[AppTrack] Failed to write job fit cache:", error);
  }
}

/**
 * Clear the entire job fit cache (call on resume upload)
 */
async function clearJobFitCache(): Promise<void> {
  try {
    await remove(STORAGE_KEYS.JOB_FIT_CACHE);
  } catch (error) {
    console.error("[AppTrack] Failed to clear job fit cache:", error);
  }
}

export const storage = {
  get,
  set,
  remove,
  clear,
  getAuthState,
  setAuthState,
  clearAuthState,
  getSettings,
  setSettings,
  getJobFitCacheEntry,
  setJobFitCacheEntry,
  clearJobFitCache,
};
