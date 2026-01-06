import { vi } from "vitest";
import "@testing-library/jest-dom/vitest";

// Mock browser API (webextension-polyfill)
const browserMock = {
  runtime: {
    id: "test-extension-id",
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    onMessageExternal: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    onInstalled: {
      addListener: vi.fn(),
    },
    onStartup: {
      addListener: vi.fn(),
    },
  },
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  tabs: {
    query: vi.fn(),
    sendMessage: vi.fn(),
    create: vi.fn(),
    onUpdated: {
      addListener: vi.fn(),
    },
    onActivated: {
      addListener: vi.fn(),
    },
    onRemoved: {
      addListener: vi.fn(),
    },
  },
  alarms: {
    create: vi.fn(),
    clear: vi.fn(),
    onAlarm: {
      addListener: vi.fn(),
    },
  },
  action: {
    setIcon: vi.fn(),
    setBadgeText: vi.fn(),
    setBadgeBackgroundColor: vi.fn(),
  },
};

// Mock webextension-polyfill module
vi.mock("webextension-polyfill", () => ({
  default: browserMock,
}));

// Also mock chrome for any direct usage
vi.stubGlobal("chrome", browserMock);

// Mock crypto.subtle for encryption tests
const cryptoMock = {
  subtle: {
    importKey: vi.fn().mockResolvedValue({}),
    encrypt: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
    decrypt: vi.fn().mockResolvedValue(new TextEncoder().encode("decrypted")),
  },
  getRandomValues: vi.fn((arr: Uint8Array) => {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = Math.floor(Math.random() * 256);
    }
    return arr;
  }),
};

vi.stubGlobal("crypto", cryptoMock);

// Mock self for service worker context
vi.stubGlobal("self", {
  addEventListener: vi.fn(),
});

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});

// Export for use in tests
export { browserMock };
