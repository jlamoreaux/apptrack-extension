import { describe, it, expect, vi, beforeEach } from "vitest";
import { storage } from "@/shared/utils/storage";
import { STORAGE_KEYS } from "@/shared/constants";

describe("storage", () => {
  beforeEach(() => {
    vi.mocked(chrome.storage.local.get).mockResolvedValue({});
    vi.mocked(chrome.storage.local.set).mockResolvedValue();
    vi.mocked(chrome.storage.local.remove).mockResolvedValue();
    vi.mocked(chrome.storage.local.clear).mockResolvedValue();
  });

  describe("get", () => {
    it("should retrieve a value from storage", async () => {
      vi.mocked(chrome.storage.local.get).mockResolvedValue({
        [STORAGE_KEYS.AUTH_STATE]: { isAuthenticated: true },
      });

      const result = await storage.get(STORAGE_KEYS.AUTH_STATE);
      expect(result).toEqual({ isAuthenticated: true });
      expect(chrome.storage.local.get).toHaveBeenCalledWith(STORAGE_KEYS.AUTH_STATE);
    });

    it("should return null for missing keys", async () => {
      vi.mocked(chrome.storage.local.get).mockResolvedValue({});

      const result = await storage.get(STORAGE_KEYS.AUTH_STATE);
      expect(result).toBeNull();
    });
  });

  describe("set", () => {
    it("should store a value", async () => {
      const value = { isAuthenticated: true, token: "test-token" };

      await storage.set(STORAGE_KEYS.AUTH_STATE, value);
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        [STORAGE_KEYS.AUTH_STATE]: value,
      });
    });
  });

  describe("getAuthState", () => {
    it("should return auth state", async () => {
      const authState = { isAuthenticated: true, token: "test-token" };
      vi.mocked(chrome.storage.local.get).mockResolvedValue({
        [STORAGE_KEYS.AUTH_STATE]: authState,
      });

      const result = await storage.getAuthState();
      expect(result).toEqual(authState);
    });

    it("should return default auth state when not set", async () => {
      vi.mocked(chrome.storage.local.get).mockResolvedValue({});

      const result = await storage.getAuthState();
      expect(result).toEqual({ isAuthenticated: false });
    });
  });
});
