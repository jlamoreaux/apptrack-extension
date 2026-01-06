import { describe, it, expect, vi, beforeEach } from "vitest";
import { storage } from "@/shared/utils/storage";
import { STORAGE_KEYS } from "@/shared/constants";
import { browserMock } from "./setup";

describe("storage", () => {
  beforeEach(() => {
    vi.mocked(browserMock.storage.local.get).mockResolvedValue({});
    vi.mocked(browserMock.storage.local.set).mockResolvedValue();
    vi.mocked(browserMock.storage.local.remove).mockResolvedValue();
    vi.mocked(browserMock.storage.local.clear).mockResolvedValue();
  });

  describe("get", () => {
    it("should retrieve a value from storage", async () => {
      vi.mocked(browserMock.storage.local.get).mockResolvedValue({
        [STORAGE_KEYS.AUTH_STATE]: { isAuthenticated: true },
      });

      const result = await storage.get(STORAGE_KEYS.AUTH_STATE);
      expect(result).toEqual({ isAuthenticated: true });
      expect(browserMock.storage.local.get).toHaveBeenCalledWith(STORAGE_KEYS.AUTH_STATE);
    });

    it("should return null for missing keys", async () => {
      vi.mocked(browserMock.storage.local.get).mockResolvedValue({});

      const result = await storage.get(STORAGE_KEYS.AUTH_STATE);
      expect(result).toBeNull();
    });
  });

  describe("set", () => {
    it("should store a value", async () => {
      const value = { isAuthenticated: true, token: "test-token" };

      await storage.set(STORAGE_KEYS.AUTH_STATE, value);
      expect(browserMock.storage.local.set).toHaveBeenCalledWith({
        [STORAGE_KEYS.AUTH_STATE]: value,
      });
    });
  });

  describe("getAuthState", () => {
    it("should return default auth state when not set", async () => {
      vi.mocked(browserMock.storage.local.get).mockResolvedValue({});

      const result = await storage.getAuthState();
      expect(result).toEqual({ isAuthenticated: false });
    });

    it("should return auth state with decrypted tokens", async () => {
      vi.mocked(browserMock.storage.local.get).mockResolvedValue({
        [STORAGE_KEYS.AUTH_STATE]: {
          isAuthenticated: true,
          userId: "user-123",
          expiresAt: Date.now() + 3600000,
        },
      });

      const result = await storage.getAuthState();
      expect(result.isAuthenticated).toBe(true);
      expect(result.userId).toBe("user-123");
    });
  });

  describe("clearAuthState", () => {
    it("should remove auth state from storage", async () => {
      await storage.clearAuthState();
      expect(browserMock.storage.local.remove).toHaveBeenCalledWith(STORAGE_KEYS.AUTH_STATE);
    });
  });
});
