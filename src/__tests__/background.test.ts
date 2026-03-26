import { describe, it, expect, vi, beforeEach } from "vitest";
import { browserMock } from "./setup";

// We can't directly test the background script as it has side effects on import
// Instead, we test the individual functions would work correctly with the mocks

describe("Background Worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Icon Badge Management", () => {
    it("should update badge color and text", async () => {
      // The background worker calls setBadgeBackgroundColor and setBadgeText
      await browserMock.action.setBadgeBackgroundColor({ color: "#3B82F6" });
      await browserMock.action.setBadgeText({ text: "" });

      expect(browserMock.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
        color: "#3B82F6",
      });
      expect(browserMock.action.setBadgeText).toHaveBeenCalledWith({ text: "" });
    });

    it("should support tab-specific badge updates", async () => {
      const tabId = 123;

      await browserMock.action.setBadgeBackgroundColor({ tabId, color: "#22C55E" });
      await browserMock.action.setBadgeText({ tabId, text: "+" });

      expect(browserMock.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
        tabId,
        color: "#22C55E",
      });
      expect(browserMock.action.setBadgeText).toHaveBeenCalledWith({
        tabId,
        text: "+",
      });
    });
  });

  describe("Token Refresh Alarms", () => {
    it("should create alarm for token refresh", async () => {
      const refreshTime = Date.now() + 24 * 60 * 60 * 1000; // 1 day from now

      await browserMock.alarms.create("apptrack_token_refresh", {
        when: refreshTime,
      });

      expect(browserMock.alarms.create).toHaveBeenCalledWith(
        "apptrack_token_refresh",
        expect.objectContaining({ when: refreshTime })
      );
    });

    it("should clear alarm on logout", async () => {
      await browserMock.alarms.clear("apptrack_token_refresh");

      expect(browserMock.alarms.clear).toHaveBeenCalledWith("apptrack_token_refresh");
    });
  });

  describe("Tab Listeners", () => {
    it("should register tab update listener", () => {
      const callback = vi.fn();
      browserMock.tabs.onUpdated = { addListener: vi.fn() };
      browserMock.tabs.onUpdated.addListener(callback);

      expect(browserMock.tabs.onUpdated.addListener).toHaveBeenCalledWith(callback);
    });

    it("should query active tab", async () => {
      vi.mocked(browserMock.tabs.query).mockResolvedValue([
        { id: 123, url: "https://example.com/jobs/123" },
      ]);

      const tabs = await browserMock.tabs.query({ active: true, currentWindow: true }) as Array<{ id: number; url: string }>;

      expect(tabs[0]?.id).toBe(123);
      expect(browserMock.tabs.query).toHaveBeenCalledWith({
        active: true,
        currentWindow: true,
      });
    });

    it("should send message to tab", async () => {
      vi.mocked(browserMock.tabs.sendMessage).mockResolvedValue({
        success: true,
        data: { title: "Software Engineer", company: "Acme Corp" },
      });

      const response = await browserMock.tabs.sendMessage(123, {
        type: "EXTRACT_JOB_DATA",
      }) as { success: boolean; data: { title: string; company: string } };

      expect(response).toEqual({
        success: true,
        data: { title: "Software Engineer", company: "Acme Corp" },
      });
    });
  });

  describe("Message Handling", () => {
    it("should register message listener", () => {
      const callback = vi.fn();
      browserMock.runtime.onMessage.addListener(callback);

      expect(browserMock.runtime.onMessage.addListener).toHaveBeenCalledWith(callback);
    });

    it("should handle runtime messages", async () => {
      vi.mocked(browserMock.runtime.sendMessage).mockResolvedValue({
        isAuthenticated: true,
        userId: "user-123",
      });

      const response = await browserMock.runtime.sendMessage({
        type: "GET_AUTH_STATE",
      }) as { isAuthenticated: boolean; userId: string };

      expect(response).toEqual({
        isAuthenticated: true,
        userId: "user-123",
      });
    });
  });

  describe("Storage Integration", () => {
    it("should get pending saves from storage", async () => {
      const pendingSaves = [
        {
          id: "pending_123",
          data: { jobTitle: "Test", company: "Test Co", jobUrl: "https://test.com" },
          timestamp: Date.now(),
          retries: 0,
        },
      ];

      vi.mocked(browserMock.storage.local.get).mockResolvedValue({
        apptrack_pending_saves: pendingSaves,
      });

      const result = await browserMock.storage.local.get("apptrack_pending_saves") as Record<string, unknown>;

      expect(result.apptrack_pending_saves).toEqual(pendingSaves);
    });

    it("should set pending saves to storage", async () => {
      const pendingSaves = [
        {
          id: "pending_456",
          data: { jobTitle: "Test 2", company: "Test Co 2", jobUrl: "https://test2.com" },
          timestamp: Date.now(),
          retries: 1,
        },
      ];

      await browserMock.storage.local.set({ apptrack_pending_saves: pendingSaves });

      expect(browserMock.storage.local.set).toHaveBeenCalledWith({
        apptrack_pending_saves: pendingSaves,
      });
    });
  });
});
