/**
 * Typed wrapper around chrome.storage.local
 */

import type { AuthState } from "@/shared/types";
import { STORAGE_KEYS } from "@/shared/constants";

type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

/**
 * Get a value from storage
 */
export async function get<T>(key: StorageKey): Promise<T | null> {
  const result = await chrome.storage.local.get(key);
  return (result[key] as T) ?? null;
}

/**
 * Set a value in storage
 */
export async function set<T>(key: StorageKey, value: T): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

/**
 * Remove a value from storage
 */
export async function remove(key: StorageKey): Promise<void> {
  await chrome.storage.local.remove(key);
}

/**
 * Clear all extension storage
 */
export async function clear(): Promise<void> {
  await chrome.storage.local.clear();
}

/**
 * Get the current auth state
 */
export async function getAuthState(): Promise<AuthState> {
  const state = await get<AuthState>(STORAGE_KEYS.AUTH_STATE);
  return state ?? { isAuthenticated: false };
}

/**
 * Set the auth state
 */
export async function setAuthState(state: AuthState): Promise<void> {
  await set(STORAGE_KEYS.AUTH_STATE, state);
}

/**
 * Clear the auth state (logout)
 */
export async function clearAuthState(): Promise<void> {
  await remove(STORAGE_KEYS.AUTH_STATE);
}

export const storage = {
  get,
  set,
  remove,
  clear,
  getAuthState,
  setAuthState,
  clearAuthState,
};
