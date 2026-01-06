# AppTrack Extension - Implementation Plan

## Phase 0: Project Setup (First Priority)

### Task 0.1: Initialize Vite + React + TypeScript Project
**Files to create:**
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration
- `vite.config.ts` - Vite with CRXJS plugin
- `src/manifest.ts` - Dynamic manifest generation for CRXJS

**Key dependencies:**
```json
{
  "devDependencies": {
    "@crxjs/vite-plugin": "^2.0.0-beta.25",
    "@types/chrome": "^0.0.268",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "webextension-polyfill": "^0.12.0"
  }
}
```

### Task 0.2: Configure Manifest V3
**File:** `src/manifest.ts`
```typescript
// Key manifest settings:
{
  manifest_version: 3,
  name: "AppTrack - Job Application Tracker",
  permissions: ["storage", "activeTab", "alarms"],
  host_permissions: ["https://apptrack.ing/*"],
  action: { default_popup: "popup.html" },
  background: { service_worker: "src/background/index.ts" },
  content_scripts: [{ matches: ["<all_urls>"], js: ["src/content/index.ts"] }]
}
```

### Task 0.3: Create Directory Structure
```
src/
├── background/          # Service worker
│   └── index.ts
├── content/             # Content script for job extraction
│   └── index.ts
├── popup/               # React popup UI
│   ├── index.html
│   ├── main.tsx
│   └── App.tsx
├── shared/              # Shared utilities and types
│   ├── types/
│   ├── utils/
│   └── constants.ts
├── manifest.ts
└── vite-env.d.ts
public/
├── icons/
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
```

### Task 0.4: Setup Tailwind CSS
**Files:**
- `tailwind.config.js`
- `postcss.config.js`
- `src/popup/index.css`

### Task 0.5: Configure ESLint & Prettier
**Files:**
- `.eslintrc.cjs`
- `.prettierrc`
- `.editorconfig`

### Task 0.6: Setup Testing Infrastructure
**Files:**
- `vitest.config.ts`
- `playwright.config.ts`
- `src/__tests__/setup.ts`

**Dependencies:**
- `vitest` - Unit testing
- `@playwright/test` - E2E testing
- `@testing-library/react` - React component testing

### Task 0.7: GitHub Actions CI/CD
**File:** `.github/workflows/ci.yml`
- Lint on PR
- Run tests
- Build extension
- Upload artifact for manual testing

---

## Phase 1: Core Infrastructure (Second Priority)

### Task 1.1: Storage Wrapper
**File:** `src/shared/utils/storage.ts`
- Typed wrapper around `chrome.storage.local`
- Methods: `get<T>()`, `set<T>()`, `remove()`, `clear()`
- Encryption for sensitive data (auth tokens)

### Task 1.2: API Client
**File:** `src/shared/utils/api.ts`
- Base URL configuration (pointing to `https://apptrack.ing/api`)
- Request/response interceptors
- Retry logic with exponential backoff
- Token injection from storage
- Error handling and typing

### Task 1.3: Message Bus
**File:** `src/shared/utils/messaging.ts`
- Typed message passing between background/popup/content scripts
- Message types enum
- Request/response patterns

### Task 1.4: Shared Types
**File:** `src/shared/types/index.ts`
```typescript
interface JobData {
  title: string;
  company: string;
  url: string;
  description?: string;
  location?: string;
  salary?: string;
  jobType?: string;
}

interface AuthState {
  isAuthenticated: boolean;
  token?: string;
  expiresAt?: number;
}

type ExtensionState = 'logged_out' | 'no_job' | 'job_detected' | 'already_tracked' | 'success';
```

### Task 1.5: Analytics Integration
**File:** `src/shared/utils/analytics.ts`
- PostHog initialization
- Event tracking functions
- Privacy-respecting configuration (no PII, domain-only)
- Opt-out support

### Task 1.6: Constants & Configuration
**File:** `src/shared/constants.ts`
- API endpoints
- Storage keys
- Default values
- Feature flags

---

## Implementation Order

```
Week 1:
├── Day 1-2: Tasks 0.1 - 0.5 (Core project setup)
├── Day 3: Tasks 0.6 - 0.7 (Testing & CI)
└── Day 4-5: Tasks 1.1 - 1.3 (Storage, API, Messaging)

Week 2:
├── Day 1: Tasks 1.4 - 1.6 (Types, Analytics, Constants)
└── Day 2+: Phase 2 (Authentication)
```

---

## Critical Decisions Made

1. **CRXJS over manual manifest** - Better DX, HMR support, handles manifest differences
2. **React 19** - Per PRD specification
3. **Vitest over Jest** - Better Vite integration, faster
4. **webextension-polyfill** - Cross-browser compatibility from day 1
5. **TypeScript strict mode** - Catch errors early

---

## Next Steps After Plan Approval

1. Initialize the project with `npm create vite@latest`
2. Install CRXJS and configure for Chrome extension
3. Create the directory structure
4. Add placeholder files for all entry points
5. Configure build and dev scripts
6. Setup CI pipeline

---

## Dependencies on Main AppTrack Repo

The following will be needed before Phase 2 (Auth):
- `POST /api/auth/extension-token` endpoint
- `POST /api/auth/refresh-extension-token` endpoint
- Auth callback page in web app

For Phase 6:
- `GET /api/applications/check-duplicate` endpoint
- Extension token support in `POST /api/applications`
