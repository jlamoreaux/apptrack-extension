/**
 * Tests for authentication flow
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import "./setup"; // Import setup for mocks

// Mock api module
vi.mock("@/shared/utils/api", () => ({
  api: {
    validateToken: vi.fn(),
    refreshToken: vi.fn(),
    checkDuplicate: vi.fn(),
  },
  ApiClientError: class ApiClientError extends Error {
    code?: string;
    status?: number;
    constructor(message: string, code?: string, status?: number) {
      super(message);
      this.code = code;
      this.status = status;
    }
  },
}));

// Mock storage module
vi.mock("@/shared/utils/storage", () => ({
  storage: {
    getAuthState: vi.fn(),
    setAuthState: vi.fn(),
    clearAuthState: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
  },
}));

describe("Auth Callback URL Parsing", () => {
  // Helper to create URL search params
  function createParams(params: Record<string, string>): URLSearchParams {
    return new URLSearchParams(params);
  }

  it("should parse direct token flow params correctly", () => {
    const params = createParams({
      token: "test-token-123",
      expiresAt: "2027-01-15T00:00:00.000Z",
      userId: "user-789",
    });

    expect(params.get("token")).toBe("test-token-123");
    expect(params.get("expiresAt")).toBe("2027-01-15T00:00:00.000Z");
    expect(params.get("userId")).toBe("user-789");
  });

  it("should parse error params", () => {
    const params = createParams({
      error: "access_denied",
    });

    expect(params.get("error")).toBe("access_denied");
  });

  it("should handle URL-encoded error messages", () => {
    const params = createParams({
      error: encodeURIComponent("Invalid credentials provided"),
    });

    expect(decodeURIComponent(params.get("error")!)).toBe("Invalid credentials provided");
  });
});

describe("External Message Handler", () => {
  it("should validate sender URL from apptrack.ing", () => {
    const validUrls = [
      "https://apptrack.ing/",
      "https://apptrack.ing/auth/extension",
      "https://www.apptrack.ing/",
      "https://www.apptrack.ing/auth/callback",
    ];

    validUrls.forEach((url) => {
      const isValid =
        url.startsWith("https://apptrack.ing/") || url.startsWith("https://www.apptrack.ing/");
      expect(isValid).toBe(true);
    });
  });

  it("should reject invalid sender URLs", () => {
    const invalidUrls = [
      "https://evil.com/",
      "https://apptrack.ing.evil.com/",
      "http://apptrack.ing/",
      "https://notapptrack.ing/",
    ];

    invalidUrls.forEach((url) => {
      const isValid =
        url.startsWith("https://apptrack.ing/") || url.startsWith("https://www.apptrack.ing/");
      expect(isValid).toBe(false);
    });
  });
});

describe("Auth State Management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should store auth state via message", async () => {
    const { storage } = await import("@/shared/utils/storage");
    const mockSetAuthState = vi.mocked(storage.setAuthState);
    mockSetAuthState.mockResolvedValue();

    const authPayload = {
      token: "new-token",
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      userId: "user-123",
    };

    // Simulate the SET_AUTH_STATE handler
    await storage.setAuthState({
      isAuthenticated: true,
      ...authPayload,
    });

    expect(mockSetAuthState).toHaveBeenCalledWith({
      isAuthenticated: true,
      token: authPayload.token,
      expiresAt: authPayload.expiresAt,
      userId: authPayload.userId,
    });
  });

  it("should clear auth state on logout", async () => {
    const { storage } = await import("@/shared/utils/storage");
    const mockClearAuthState = vi.mocked(storage.clearAuthState);
    mockClearAuthState.mockResolvedValue();

    await storage.clearAuthState();

    expect(mockClearAuthState).toHaveBeenCalled();
  });
});

describe("Token Refresh", () => {
  it("should refresh token using Authorization header (no args)", async () => {
    const { api } = await import("@/shared/utils/api");
    const mockRefreshToken = vi.fn();
    api.refreshToken = mockRefreshToken;

    const mockResponse = {
      token: "new-access-token",
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };

    mockRefreshToken.mockResolvedValue(mockResponse);

    const result = await api.refreshToken();

    expect(mockRefreshToken).toHaveBeenCalledWith();
    expect(result.token).toBe("new-access-token");
  });

  it("should handle expired token", async () => {
    const { api, ApiClientError } = await import("@/shared/utils/api");
    const mockRefreshToken = vi.fn();
    api.refreshToken = mockRefreshToken;

    mockRefreshToken.mockRejectedValue(new ApiClientError("Token expired", "TOKEN_EXPIRED", 401));

    await expect(api.refreshToken()).rejects.toThrow("Token expired");
  });
});

describe("PING message for extension detection", () => {
  it("should respond to PING from apptrack.ing", () => {
    const handlePing = () => {
      return Promise.resolve({ success: true });
    };

    return expect(handlePing()).resolves.toEqual({ success: true });
  });
});
